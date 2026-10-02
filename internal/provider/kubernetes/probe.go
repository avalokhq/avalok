package kubernetes

import (
	"context"

	authenticationv1 "k8s.io/api/authentication/v1"
	authorizationv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/tools/clientcmd"
)

// ProbeInfo describes a connected cluster for credential tests. No secrets.
type ProbeInfo struct {
	AuthSource string // "kubeconfig", "kubeconfig file", "bearer token", "in-cluster"
	Context    string
	Server     string
	Version    string
	Platform   string
	Identity   string // empty if the cluster doesn't support SelfSubjectReview
	Namespace  string
	// Permission checks in Namespace; nil when the check itself failed.
	CanListPods *bool
	CanGetLogs  *bool
}

// AuthSource reports which credential source Connect will use. Safe to call before Connect.
func (p *Provider) AuthSource() string {
	switch {
	case p.kubeconfigContent != "":
		return "kubeconfig"
	case p.kubeconfig != "":
		return "kubeconfig file"
	case p.bearerToken != "":
		return "bearer token"
	default:
		return "in-cluster"
	}
}

// APIServer returns the API server URL once Connect has built a client config.
func (p *Provider) APIServer() string {
	if p.restConfig != nil {
		return p.restConfig.Host
	}
	return p.apiServerURL
}

// Probe gathers cluster details after a successful Connect.
func (p *Provider) Probe(ctx context.Context) ProbeInfo {
	info := ProbeInfo{AuthSource: p.AuthSource(), Namespace: p.namespace, Context: p.contextName}
	if info.Namespace == "" {
		info.Namespace = "default"
	}
	if info.Context == "" && p.kubeconfigContent != "" {
		if cfg, err := clientcmd.Load([]byte(p.kubeconfigContent)); err == nil {
			info.Context = cfg.CurrentContext
		}
	}
	if p.restConfig != nil {
		info.Server = p.restConfig.Host
	}
	if p.clientset == nil {
		return info
	}

	if v, err := p.clientset.Discovery().ServerVersion(); err == nil {
		info.Version = v.GitVersion
		info.Platform = v.Platform
	}

	if r, err := p.clientset.AuthenticationV1().SelfSubjectReviews().Create(ctx, &authenticationv1.SelfSubjectReview{}, metav1.CreateOptions{}); err == nil {
		info.Identity = r.Status.UserInfo.Username
	}

	info.CanListPods = p.canI(ctx, info.Namespace, "list", "pods", "")
	info.CanGetLogs = p.canI(ctx, info.Namespace, "get", "pods", "log")
	return info
}

func (p *Provider) canI(ctx context.Context, namespace, verb, resource, subresource string) *bool {
	review := &authorizationv1.SelfSubjectAccessReview{
		Spec: authorizationv1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: &authorizationv1.ResourceAttributes{
				Namespace:   namespace,
				Verb:        verb,
				Resource:    resource,
				Subresource: subresource,
			},
		},
	}
	r, err := p.clientset.AuthorizationV1().SelfSubjectAccessReviews().Create(ctx, review, metav1.CreateOptions{})
	if err != nil {
		return nil
	}
	allowed := r.Status.Allowed
	return &allowed
}
