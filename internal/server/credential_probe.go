package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"regexp"
	"strings"
	"time"

	"cloud.google.com/go/storage"
	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob/bloberror"
	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/sts"
	"google.golang.org/api/googleapi"
	"google.golang.org/api/iterator"
	"google.golang.org/api/option"
	apierrors "k8s.io/apimachinery/pkg/api/errors"

	k8sprovider "github.com/avalokhq/avalok/internal/provider/kubernetes"
	"github.com/avalokhq/avalok/internal/sshclient"
	"github.com/avalokhq/avalok/internal/winrmclient"
)

// probeReport is the step-by-step result of a credential test. It is shown to
// admins so they can verify what was actually connected to; it must never
// contain secret values.
type probeReport struct {
	Status     string      `json:"status"` // ok | error
	Message    string      `json:"message,omitempty"`
	Error      string      `json:"error,omitempty"`
	Target     string      `json:"target,omitempty"`
	DurationMs int64       `json:"duration_ms"`
	Steps      []probeStep `json:"steps"`
	Facts      []probeFact `json:"facts,omitempty"`
}

type probeStep struct {
	Name       string `json:"name"`
	Status     string `json:"status"` // ok | failed | warning | skipped
	Detail     string `json:"detail,omitempty"`
	DurationMs int64  `json:"duration_ms,omitempty"`
}

type probeFact struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

func (r *probeReport) step(name, status, detail string, d time.Duration) {
	r.Steps = append(r.Steps, probeStep{Name: name, Status: status, Detail: detail, DurationMs: d.Milliseconds()})
}

func (r *probeReport) fact(label, value string) {
	if value != "" {
		r.Facts = append(r.Facts, probeFact{Label: label, Value: value})
	}
}

// fail marks the report failed with a short reason; the first reason wins.
func (r *probeReport) fail(reason string) {
	if r.Status != "error" {
		r.Status = "error"
		r.Error = reason
	}
}

func (r *probeReport) finish(start time.Time) {
	r.DurationMs = time.Since(start).Milliseconds()
	if r.Status == "" {
		r.Status = "ok"
		r.Message = "connection successful"
		for _, s := range r.Steps {
			if s.Status == "warning" {
				r.Message = "connected with warnings"
				break
			}
		}
	}
}

const probeTimeout = 15 * time.Second

// --- shared network steps ---

// probeResolve looks up host and records a DNS step. Returns false on failure.
func probeResolve(ctx context.Context, r *probeReport, host string) bool {
	if ip := net.ParseIP(host); ip != nil {
		r.step("DNS lookup", "skipped", host+" is an IP address", 0)
		return true
	}
	start := time.Now()
	addrs, err := net.DefaultResolver.LookupHost(ctx, host)
	d := time.Since(start)
	if err != nil {
		var dnsErr *net.DNSError
		detail := "could not resolve " + host
		if errors.As(err, &dnsErr) && dnsErr.IsNotFound {
			detail += " — name does not exist (check spelling or the server's DNS)"
		} else if errors.As(err, &dnsErr) && dnsErr.IsTimeout {
			detail += " — DNS server did not answer"
		}
		r.step("DNS lookup", "failed", detail, d)
		r.fail("DNS lookup failed")
		return false
	}
	r.step("DNS lookup", "ok", host+" → "+strings.Join(limitList(addrs, 4), ", "), d)
	return true
}

// probeTCP opens and closes a TCP connection to addr. Returns false on failure.
func probeTCP(ctx context.Context, r *probeReport, addr string) bool {
	start := time.Now()
	var d net.Dialer
	conn, err := d.DialContext(ctx, "tcp", addr)
	elapsed := time.Since(start)
	if err != nil {
		reason, detail := describeDialError(ctx, err, addr)
		r.step("TCP connect", "failed", detail, elapsed)
		r.fail(reason)
		return false
	}
	remote := conn.RemoteAddr().String()
	conn.Close()
	r.step("TCP connect", "ok", "port open on "+remote, elapsed)
	r.fact("Connected IP", remote)
	return true
}

func describeDialError(ctx context.Context, err error, addr string) (reason, detail string) {
	msg := strings.ToLower(err.Error())
	switch {
	case ctx.Err() == context.DeadlineExceeded || strings.Contains(msg, "i/o timeout") || strings.Contains(msg, "timed out"):
		return "timeout", "no response from " + addr + " — a firewall may be dropping traffic, or the port is wrong"
	case strings.Contains(msg, "connection refused"):
		return "connection refused", addr + " refused the connection — host is up but nothing is listening on that port"
	case strings.Contains(msg, "no route to host"), strings.Contains(msg, "network is unreachable"), strings.Contains(msg, "host is down"):
		return "host unreachable", addr + " is unreachable from the Avalok server (no route)"
	case strings.Contains(msg, "no such host"):
		return "DNS lookup failed", "could not resolve " + addr
	}
	return "connection failed", "could not connect to " + addr
}

// --- SSH ---

var sshMethodsRe = regexp.MustCompile(`attempted methods \[[^\]]*\]`)

func probeSSH(ctx context.Context, r *probeReport, cfg map[string]any) {
	sc := sshclient.ConfigFromMap(cfg)
	client := sshclient.New(sc)
	defer client.Close()

	port := sc.Port
	if port == "" {
		port = "22"
	}
	r.Target = net.JoinHostPort(sc.Host, port)

	if !probeResolve(ctx, r, sc.Host) {
		return
	}

	err := client.Connect(ctx)
	info := client.Info()
	r.Target = info.User + "@" + info.Addr

	switch {
	case err != nil && info.Stage == sshclient.StageAuthConfig:
		msg := err.Error()
		detail := "no usable login method — set a private key or password"
		switch {
		case strings.Contains(msg, "parse inline private key"):
			detail = "private key could not be read — check the PEM text, and the passphrase if the key is encrypted"
		case strings.Contains(msg, "read key"), strings.Contains(msg, "parse key"):
			detail = "key file could not be read on the Avalok server"
		}
		r.step("Load credentials", "failed", detail, 0)
		r.fail("invalid credentials")
		return
	default:
		r.step("Load credentials", "ok", strings.Join(info.AuthMethods, ", "), 0)
	}

	if err != nil && info.Stage == sshclient.StageDial {
		reason, detail := describeDialError(ctx, err, info.Addr)
		r.step("TCP connect", "failed", detail, info.DialTime)
		r.fail(reason)
		return
	}
	r.step("TCP connect", "ok", "connected to "+info.RemoteAddr, info.DialTime)
	r.fact("Connected IP", info.RemoteAddr)

	hostKey := ""
	if info.HostKeyFingerprint != "" {
		hostKey = info.HostKeyType + " " + info.HostKeyFingerprint
		r.fact("Host key", hostKey)
	}

	if err != nil {
		msg := err.Error()
		if strings.Contains(msg, "unable to authenticate") {
			r.step("SSH handshake", "ok", "host key "+hostKey, info.HandshakeTime)
			detail := "server rejected login as " + info.User
			if m := sshMethodsRe.FindString(msg); m != "" {
				detail += " (" + m + ")"
			}
			detail += " — wrong user, key or password, or the key isn't in authorized_keys"
			r.step("Authenticate", "failed", detail, 0)
			r.fail("authentication failed")
			return
		}
		detail := "handshake failed"
		switch {
		case ctx.Err() == context.DeadlineExceeded || strings.Contains(msg, "timeout"):
			detail = "server accepted TCP but did not complete the SSH handshake in time"
			r.fail("timeout")
		case strings.Contains(msg, "EOF"), strings.Contains(msg, "connection reset"):
			detail = "server closed the connection during handshake — not an SSH server, or the client IP is blocked (e.g. fail2ban, AllowUsers)"
			r.fail("connection failed")
		default:
			r.fail("connection failed")
		}
		r.step("SSH handshake", "failed", detail, info.HandshakeTime)
		return
	}

	r.step("SSH handshake", "ok", info.ServerVersion+" · host key "+hostKey, info.HandshakeTime)
	r.step("Authenticate", "ok", "logged in as "+info.User, 0)
	r.fact("Server software", info.ServerVersion)
	r.fact("Login method", strings.Join(info.AuthMethods, ", "))

	start := time.Now()
	out, runErr := client.Run(ctx, "whoami && hostname")
	d := time.Since(start)
	if runErr != nil {
		r.step("Run command", "failed", "logged in, but `whoami && hostname` could not run — the account may have no shell", d)
		r.fail("command failed")
		return
	}
	lines := nonEmptyLines(string(out))
	r.step("Run command", "ok", "`whoami && hostname` → "+strings.Join(lines, " / "), d)
	if len(lines) > 0 {
		r.fact("Remote user", lines[0])
	}
	if len(lines) > 1 {
		r.fact("Remote hostname", lines[1])
	}
}

// --- WinRM ---

func probeWinRM(ctx context.Context, r *probeReport, cfg map[string]any) {
	client := winrmclient.New(winrmclient.ConfigFromMap(cfg))
	defer client.Close()

	scheme, host, port := client.Endpoint()
	addr := net.JoinHostPort(host, port)
	r.Target = client.User() + "@" + scheme + "://" + addr
	r.fact("Endpoint", scheme+"://"+addr+"/wsman")

	if !probeResolve(ctx, r, host) || !probeTCP(ctx, r, addr) {
		return
	}

	if err := client.Connect(ctx); err != nil {
		r.step("Prepare client", "failed", "invalid port "+port, 0)
		r.fail("invalid configuration")
		return
	}

	start := time.Now()
	out, err := client.Run(ctx, `"$env:USERDOMAIN\$env:USERNAME"; hostname; [Environment]::OSVersion.VersionString`)
	d := time.Since(start)
	if err != nil {
		msg := strings.ToLower(err.Error())
		switch {
		case strings.Contains(msg, "401"):
			r.step("Authenticate", "failed", "server returned 401 Unauthorized for "+client.User()+" — wrong username/password, or Basic auth is disabled on the WinRM listener", d)
			r.fail("authentication failed")
		case strings.Contains(msg, "x509"), strings.Contains(msg, "certificate"):
			r.step("TLS", "failed", "server certificate is not trusted — use Skip TLS Verification for self-signed certificates", d)
			r.fail("TLS certificate error")
		case strings.Contains(msg, "malformed http response"), strings.Contains(msg, "server gave http response to https client"):
			r.step("TLS", "failed", "port "+port+" does not speak "+strings.ToUpper(scheme)+" — check Use HTTPS and the port (5985 = HTTP, 5986 = HTTPS)", d)
			r.fail("protocol mismatch")
		case ctx.Err() == context.DeadlineExceeded || strings.Contains(msg, "timeout"):
			r.step("Run PowerShell", "failed", "no reply from WinRM in time", d)
			r.fail("timeout")
		default:
			r.step("Run PowerShell", "failed", "WinRM request failed", d)
			r.fail("connection failed")
		}
		return
	}

	lines := nonEmptyLines(string(out))
	r.step("Authenticate", "ok", "logged in as "+client.User(), 0)
	r.step("Run PowerShell", "ok", "whoami / hostname / OS version returned", d)
	if len(lines) > 0 {
		r.fact("Remote user", lines[0])
	}
	if len(lines) > 1 {
		r.fact("Remote hostname", lines[1])
	}
	if len(lines) > 2 {
		r.fact("OS", lines[2])
	}
}

// --- Kubernetes ---

func probeKubernetes(ctx context.Context, r *probeReport, cfg map[string]any) {
	p := &k8sprovider.Provider{}
	defer p.Close()

	start := time.Now()
	err := p.Connect(ctx, cfg)
	d := time.Since(start)
	source := p.AuthSource()

	if err != nil {
		msg := err.Error()
		if !strings.Contains(msg, "kubernetes API unreachable") {
			detail := "could not build a client from the " + source
			switch {
			case strings.Contains(msg, "parsing kubeconfig"):
				detail = "kubeconfig could not be parsed — paste the full YAML file"
			case strings.Contains(msg, "context") && strings.Contains(msg, "does not exist"):
				detail = "context not found in kubeconfig"
			case strings.Contains(msg, "bearer_token requires api_server_url"):
				detail = "bearer token needs an API Server URL"
			case strings.Contains(msg, "in-cluster config failed"):
				detail = "no kubeconfig or token set, and the Avalok server is not running inside a cluster"
			case strings.Contains(msg, "invalid proxy_url"):
				detail = "proxy URL is invalid"
			}
			r.step("Load credentials", "failed", detail, d)
			r.fail("invalid credentials")
			return
		}
		r.step("Load credentials", "ok", source, 0)
		server := p.APIServer()
		r.Target = server
		switch {
		case apierrors.IsUnauthorized(err):
			r.step("Authenticate", "failed", server+" returned 401 Unauthorized — token or client certificate is invalid or expired", d)
			r.fail("authentication failed")
		case apierrors.IsForbidden(err):
			r.step("Authenticate", "failed", server+" returned 403 Forbidden", d)
			r.fail("authentication failed")
		default:
			lower := strings.ToLower(msg)
			reason, detail := "connection failed", "could not reach "+server
			switch {
			case strings.Contains(lower, "x509"), strings.Contains(lower, "certificate"):
				reason, detail = "TLS certificate error", server+" presented a certificate that isn't trusted — set the CA certificate"
			case strings.Contains(lower, "no such host"):
				reason, detail = "DNS lookup failed", "could not resolve "+server
			case strings.Contains(lower, "connection refused"):
				reason, detail = "connection refused", server+" refused the connection"
			case strings.Contains(lower, "timeout"), ctx.Err() == context.DeadlineExceeded:
				reason, detail = "timeout", "no response from "+server
			}
			r.step("Reach API server", "failed", detail, d)
			r.fail(reason)
		}
		return
	}

	info := p.Probe(ctx)
	r.Target = info.Server
	credDetail := info.AuthSource
	if info.Context != "" {
		credDetail += " · context " + info.Context
	}
	r.step("Load credentials", "ok", credDetail, 0)
	r.step("Reach API server", "ok", info.Server+" · Kubernetes "+info.Version, d)
	if info.Identity != "" {
		r.step("Identity", "ok", "authenticated as "+info.Identity, 0)
	} else {
		r.step("Identity", "skipped", "cluster does not report the caller identity (needs Kubernetes 1.28+)", 0)
	}

	switch {
	case info.CanListPods == nil || info.CanGetLogs == nil:
		r.step("Permissions", "skipped", "could not check access in namespace "+info.Namespace, 0)
	case *info.CanListPods && *info.CanGetLogs:
		r.step("Permissions", "ok", "can list pods and read pod logs in namespace "+info.Namespace, 0)
	default:
		var missing []string
		if !*info.CanListPods {
			missing = append(missing, "list pods")
		}
		if !*info.CanGetLogs {
			missing = append(missing, "read pod logs")
		}
		r.step("Permissions", "warning", "cannot "+strings.Join(missing, " or ")+" in namespace "+info.Namespace+" — log streaming will fail there", 0)
	}

	r.fact("API server", info.Server)
	r.fact("Version", info.Version)
	r.fact("Platform", info.Platform)
	r.fact("Context", info.Context)
	r.fact("Identity", info.Identity)
	r.fact("Namespace checked", info.Namespace)
}

// --- S3 ---

// apiErrorCode extracts the service error code (e.g. "InvalidAccessKeyId") from AWS SDK errors.
func apiErrorCode(err error) string {
	var ae interface{ ErrorCode() string }
	if errors.As(err, &ae) {
		return ae.ErrorCode()
	}
	return ""
}

func probeS3(ctx context.Context, r *probeReport, cfg map[string]any) {
	region, _ := cfg["region"].(string)
	accessKey, _ := cfg["access_key_id"].(string)
	secretKey, _ := cfg["secret_access_key"].(string)
	endpoint, _ := cfg["endpoint"].(string)

	var opts []func(*awsconfig.LoadOptions) error
	if region != "" {
		opts = append(opts, awsconfig.WithRegion(region))
	}
	if accessKey != "" && secretKey != "" {
		opts = append(opts, awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")))
	}

	start := time.Now()
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx, opts...)
	if err == nil && awsCfg.Region == "" {
		awsCfg.Region = "us-east-1"
	}
	var creds aws.Credentials
	if err == nil {
		creds, err = awsCfg.Credentials.Retrieve(ctx)
	}
	if err != nil {
		r.step("Load credentials", "failed", "no AWS credentials found — set an access key, or give the Avalok server an IAM role", time.Since(start))
		r.fail("invalid credentials")
		return
	}
	credDetail := "default credential chain (" + creds.Source + ")"
	if accessKey != "" {
		credDetail = "access key " + maskKeyID(accessKey)
	}
	r.step("Load credentials", "ok", credDetail, time.Since(start))
	r.fact("Access key", maskKeyID(creds.AccessKeyID))
	r.fact("Region", awsCfg.Region)
	r.fact("Endpoint", endpoint)

	if endpoint == "" {
		r.Target = "AWS S3 · " + awsCfg.Region
		start = time.Now()
		id, err := sts.NewFromConfig(awsCfg).GetCallerIdentity(ctx, &sts.GetCallerIdentityInput{})
		d := time.Since(start)
		if err != nil {
			code := apiErrorCode(err)
			switch code {
			case "InvalidClientTokenId", "SignatureDoesNotMatch", "ExpiredToken", "UnrecognizedClientException":
				r.step("Verify identity", "failed", "AWS rejected the key ("+code+") — access key ID or secret is wrong, or the key is disabled", d)
				r.fail("authentication failed")
			default:
				reason, detail := awsNetworkFailure(ctx, err, "AWS STS")
				r.step("Verify identity", "failed", detail, d)
				r.fail(reason)
			}
			return
		}
		r.step("Verify identity", "ok", aws.ToString(id.Arn), d)
		r.fact("Account", aws.ToString(id.Account))
		r.fact("Identity", aws.ToString(id.Arn))
	} else {
		r.Target = endpoint
		r.step("Verify identity", "skipped", "not available for S3-compatible endpoints; checked by listing buckets", 0)
	}

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		if endpoint != "" {
			o.BaseEndpoint = aws.String(endpoint)
			o.UsePathStyle = true
		}
	})
	start = time.Now()
	out, err := client.ListBuckets(ctx, &s3.ListBucketsInput{MaxBuckets: aws.Int32(100)})
	d := time.Since(start)
	if err != nil {
		code := apiErrorCode(err)
		switch code {
		case "AccessDenied":
			r.step("List buckets", "warning", "credentials are valid, but not allowed to list buckets (s3:ListAllMyBuckets) — bucket access is checked when a resource uses this credential", d)
		case "InvalidAccessKeyId", "SignatureDoesNotMatch":
			r.step("List buckets", "failed", "storage rejected the key ("+code+") — access key ID or secret is wrong", d)
			r.fail("authentication failed")
		default:
			reason, detail := awsNetworkFailure(ctx, err, "the S3 endpoint")
			if code != "" {
				detail = "request failed (" + code + ")"
			}
			r.step("List buckets", "failed", detail, d)
			r.fail(reason)
		}
		return
	}
	names := make([]string, 0, len(out.Buckets))
	for _, b := range out.Buckets {
		names = append(names, aws.ToString(b.Name))
	}
	r.step("List buckets", "ok", fmt.Sprintf("%d bucket(s) visible", len(names)), d)
	r.fact("Buckets", strings.Join(limitList(names, 5), ", "))
}

func awsNetworkFailure(ctx context.Context, err error, what string) (string, string) {
	msg := strings.ToLower(err.Error())
	switch {
	case ctx.Err() == context.DeadlineExceeded || strings.Contains(msg, "timeout"):
		return "timeout", "no response from " + what
	case strings.Contains(msg, "no such host"):
		return "DNS lookup failed", "could not resolve " + what + " — check the endpoint"
	case strings.Contains(msg, "connection refused"):
		return "connection refused", what + " refused the connection"
	case strings.Contains(msg, "x509"), strings.Contains(msg, "certificate"):
		return "TLS certificate error", what + " presented a certificate that isn't trusted"
	}
	return "connection failed", "could not reach " + what
}

// maskKeyID shows enough of a (non-secret) access key ID to recognise it.
func maskKeyID(id string) string {
	if len(id) <= 8 {
		return id
	}
	return id[:4] + "…" + id[len(id)-4:]
}

// --- GCS ---

func probeGCS(ctx context.Context, r *probeReport, cfg map[string]any) {
	credsJSON, _ := cfg["credentials_json"].(string)
	credsFile, _ := cfg["credentials_file"].(string)

	var data []byte
	source := "server default credentials (ADC)"
	switch {
	case credsJSON != "":
		data = []byte(credsJSON)
		source = "credentials JSON"
	case credsFile != "":
		b, err := os.ReadFile(credsFile)
		if err != nil {
			r.step("Load credentials", "failed", "file "+credsFile+" could not be read on the Avalok server", 0)
			r.fail("invalid credentials")
			return
		}
		data = b
		source = "file " + credsFile
	}

	var meta struct {
		Type        string `json:"type"`
		ClientEmail string `json:"client_email"`
		ProjectID   string `json:"project_id"`
	}
	if data != nil {
		if err := json.Unmarshal(data, &meta); err != nil {
			r.step("Load credentials", "failed", "credentials are not valid JSON — paste the full service account key file", 0)
			r.fail("invalid credentials")
			return
		}
	}
	detail := source
	if meta.ClientEmail != "" {
		detail += " · " + meta.ClientEmail
	}
	r.step("Load credentials", "ok", detail, 0)
	r.fact("Service account", meta.ClientEmail)
	r.fact("Project", meta.ProjectID)
	r.fact("Credential type", meta.Type)
	r.Target = "Google Cloud Storage"
	if meta.ProjectID != "" {
		r.Target += " · " + meta.ProjectID
	}

	var opts []option.ClientOption
	if data != nil {
		opts = append(opts, option.WithCredentialsJSON(data))
	}
	client, err := storage.NewClient(ctx, opts...)
	if err != nil {
		r.step("Authenticate", "failed", "could not create a storage client from these credentials", 0)
		r.fail("invalid credentials")
		return
	}
	defer client.Close()

	if meta.ProjectID == "" {
		r.step("List buckets", "skipped", "no project_id in the credentials, so buckets can't be listed; access is checked when a resource uses this credential", 0)
		return
	}

	start := time.Now()
	it := client.Buckets(ctx, meta.ProjectID)
	var names []string
	for len(names) < 100 {
		attrs, err := it.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			d := time.Since(start)
			var gErr *googleapi.Error
			msg := err.Error()
			switch {
			case errors.As(err, &gErr) && gErr.Code == 403:
				r.step("Authenticate", "ok", "Google accepted the credentials", 0)
				r.step("List buckets", "warning", "authenticated, but not allowed to list buckets in "+meta.ProjectID+" (storage.buckets.list) — bucket access is checked when a resource uses this credential", d)
			case strings.Contains(msg, "invalid_grant"), strings.Contains(msg, "oauth2"), errors.As(err, &gErr) && gErr.Code == 401:
				r.step("Authenticate", "failed", "Google rejected the credentials — the key may be deleted, disabled, or for another project", d)
				r.fail("authentication failed")
			default:
				reason, detail := awsNetworkFailure(ctx, err, "Google Cloud Storage")
				r.step("List buckets", "failed", detail, d)
				r.fail(reason)
			}
			return
		}
		names = append(names, attrs.Name)
	}
	d := time.Since(start)
	r.step("Authenticate", "ok", "Google accepted the credentials", 0)
	r.step("List buckets", "ok", fmt.Sprintf("%d bucket(s) visible in %s", len(names), meta.ProjectID), d)
	r.fact("Buckets", strings.Join(limitList(names, 5), ", "))
}

// --- Azure Storage ---

func probeAzure(ctx context.Context, r *probeReport, cfg map[string]any) {
	connStr, _ := cfg["connection_string"].(string)
	accountName, _ := cfg["account_name"].(string)
	accountKey, _ := cfg["account_key"].(string)
	sasToken, _ := cfg["sas_token"].(string)

	var client *azblob.Client
	var err error
	var method string
	serviceURL := fmt.Sprintf("https://%s.blob.core.windows.net", accountName)

	switch {
	case connStr != "":
		method = "connection string"
		client, err = azblob.NewClientFromConnectionString(connStr, nil)
	case accountName != "" && accountKey != "":
		method = "account key"
		var cred *azblob.SharedKeyCredential
		if cred, err = azblob.NewSharedKeyCredential(accountName, accountKey); err == nil {
			client, err = azblob.NewClientWithSharedKeyCredential(serviceURL, cred, nil)
		}
	case accountName != "" && sasToken != "":
		method = "SAS token"
		client, err = azblob.NewClientWithNoCredential(serviceURL+"?"+strings.TrimPrefix(sasToken, "?"), nil)
	case accountName != "":
		method = "managed identity (DefaultAzureCredential)"
		var cred *azidentity.DefaultAzureCredential
		if cred, err = azidentity.NewDefaultAzureCredential(nil); err == nil {
			client, err = azblob.NewClient(serviceURL, cred, nil)
		}
	default:
		r.step("Load credentials", "failed", "account name or connection string is required", 0)
		r.fail("invalid credentials")
		return
	}
	if err != nil {
		detail := "could not build a client from the " + method
		if method == "account key" {
			detail = "account key is not valid base64 — copy it again from the Azure portal"
		}
		r.step("Load credentials", "failed", detail, 0)
		r.fail("invalid credentials")
		return
	}
	r.step("Load credentials", "ok", method, 0)
	r.Target = client.URL()
	if i := strings.Index(r.Target, "?"); i >= 0 {
		r.Target = r.Target[:i] // never echo a SAS token
	}
	r.fact("Account URL", r.Target)
	r.fact("Auth method", method)

	start := time.Now()
	pager := client.NewListContainersPager(&azblob.ListContainersOptions{MaxResults: aws.Int32(100)})
	page, err := pager.NextPage(ctx)
	d := time.Since(start)
	if err != nil {
		msg := strings.ToLower(err.Error())
		switch {
		case bloberror.HasCode(err, bloberror.AuthenticationFailed, bloberror.InvalidAuthenticationInfo):
			r.step("Authenticate", "failed", "Azure rejected the credentials — key, SAS token or connection string is wrong or expired", d)
			r.fail("authentication failed")
		case bloberror.HasCode(err, bloberror.AuthorizationFailure, bloberror.AuthorizationPermissionMismatch, bloberror.AuthorizationResourceTypeMismatch):
			r.step("Authenticate", "ok", "Azure accepted the credentials", 0)
			r.step("List containers", "warning", "not allowed to list containers on this account — container access is checked when a resource uses this credential", d)
		case strings.Contains(msg, "no such host"):
			r.step("Reach account", "failed", "storage account "+accountName+" was not found (DNS) — check the account name", d)
			r.fail("DNS lookup failed")
		case strings.Contains(msg, "defaultazurecredential"), strings.Contains(msg, "managedidentitycredential"):
			r.step("Authenticate", "failed", "no Azure identity is available on the Avalok server", d)
			r.fail("authentication failed")
		default:
			reason, detail := awsNetworkFailure(ctx, err, "Azure Storage")
			r.step("List containers", "failed", detail, d)
			r.fail(reason)
		}
		return
	}
	names := make([]string, 0, len(page.ContainerItems))
	for _, c := range page.ContainerItems {
		if c != nil && c.Name != nil {
			names = append(names, *c.Name)
		}
	}
	r.step("Authenticate", "ok", "Azure accepted the credentials", 0)
	r.step("List containers", "ok", fmt.Sprintf("%d container(s) visible", len(names)), d)
	r.fact("Containers", strings.Join(limitList(names, 5), ", "))
}

// --- helpers ---

func nonEmptyLines(s string) []string {
	var out []string
	for _, l := range strings.Split(s, "\n") {
		if l = strings.TrimSpace(l); l != "" {
			if len(l) > 200 {
				l = l[:200] + "…"
			}
			out = append(out, l)
		}
		if len(out) == 5 {
			break
		}
	}
	return out
}

func limitList(items []string, n int) []string {
	if len(items) <= n {
		return items
	}
	return append(append([]string{}, items[:n]...), fmt.Sprintf("+%d more", len(items)-n))
}
