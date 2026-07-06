package kubernetes

import (
	"bufio"
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"

	"github.com/avalokhq/avalok/internal/provider"
)

func init() {
	provider.Register("kubernetes", func() provider.Provider {
		return &Provider{}
	})
}

type Provider struct {
	kubeconfig        string
	kubeconfigContent string
	contextName       string
	namespace         string
	selector          string
	container         string
	allContainers     bool
	previous          bool
	proxyURL          string
	bearerToken       string
	insecureSkipTLS   bool
	caCert            string
	apiServerURL      string

	deployment  string
	statefulset string
	daemonset   string
	pod         string
	tailLines   int

	clientset  *kubernetes.Clientset
	restConfig *rest.Config
}

func (p *Provider) Connect(ctx context.Context, config map[string]any) error {
	p.parseConfig(config)

	var restCfg *rest.Config
	var err error

	switch {
	case p.kubeconfigContent != "":
		cfg, loadErr := clientcmd.Load([]byte(p.kubeconfigContent))
		if loadErr != nil {
			return fmt.Errorf("parsing kubeconfig content: %w", loadErr)
		}
		overrides := &clientcmd.ConfigOverrides{}
		if p.contextName != "" {
			overrides.CurrentContext = p.contextName
		}
		restCfg, err = clientcmd.NewDefaultClientConfig(*cfg, overrides).ClientConfig()
		if err != nil {
			return fmt.Errorf("building client config from content: %w", err)
		}

	case p.kubeconfig != "":
		loadingRules := &clientcmd.ClientConfigLoadingRules{ExplicitPath: p.kubeconfig}
		overrides := &clientcmd.ConfigOverrides{}
		if p.contextName != "" {
			overrides.CurrentContext = p.contextName
		}
		restCfg, err = clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
			loadingRules, overrides,
		).ClientConfig()
		if err != nil {
			return fmt.Errorf("building client config from %s: %w", p.kubeconfig, err)
		}

	case p.bearerToken != "":
		if p.apiServerURL == "" {
			return fmt.Errorf("bearer_token requires api_server_url")
		}
		restCfg = &rest.Config{
			Host:        p.apiServerURL,
			BearerToken: p.bearerToken,
		}
		if p.insecureSkipTLS {
			restCfg.TLSClientConfig.Insecure = true
		}
		if p.caCert != "" {
			restCfg.TLSClientConfig.CAData = []byte(p.caCert)
		}

	default:
		restCfg, err = rest.InClusterConfig()
		if err != nil {
			return fmt.Errorf("no kubeconfig provided and in-cluster config failed: %w", err)
		}
	}

	if p.proxyURL != "" {
		parsed, parseErr := url.Parse(p.proxyURL)
		if parseErr != nil {
			return fmt.Errorf("invalid proxy_url %q: %w", p.proxyURL, parseErr)
		}
		restCfg.Proxy = http.ProxyURL(parsed)
	}

	if p.insecureSkipTLS {
		restCfg.TLSClientConfig.Insecure = true
	}
	if p.caCert != "" && len(restCfg.TLSClientConfig.CAData) == 0 {
		restCfg.TLSClientConfig.CAData = []byte(p.caCert)
	}

	p.clientset, err = kubernetes.NewForConfig(restCfg)
	if err != nil {
		return fmt.Errorf("creating kubernetes client: %w", err)
	}
	p.restConfig = restCfg

	_, err = p.clientset.Discovery().ServerVersion()
	if err != nil {
		return fmt.Errorf("kubernetes API unreachable: %w", err)
	}

	if p.selector == "" {
		if err := p.resolveWorkloadSelector(ctx); err != nil {
			return err
		}
	}

	return nil
}

func (p *Provider) ListInstances(ctx context.Context) ([]provider.Instance, error) {
	if p.pod != "" {
		pod, err := p.clientset.CoreV1().Pods(p.namespace).Get(ctx, p.pod, metav1.GetOptions{})
		if err != nil {
			return nil, fmt.Errorf("pod %q in %s: %w", p.pod, p.namespace, err)
		}
		return []provider.Instance{p.podToInstance(pod)}, nil
	}

	listOpts := metav1.ListOptions{}
	if p.selector != "" {
		listOpts.LabelSelector = p.selector
	}

	pods, err := p.clientset.CoreV1().Pods(p.namespace).List(ctx, listOpts)
	if err != nil {
		return nil, fmt.Errorf("listing pods in %s: %w", p.namespace, err)
	}

	instances := make([]provider.Instance, 0, len(pods.Items))
	for i := range pods.Items {
		instances = append(instances, p.podToInstance(&pods.Items[i]))
	}

	return instances, nil
}

func (p *Provider) podToInstance(pod *corev1.Pod) provider.Instance {
	meta := map[string]string{
		"namespace": pod.Namespace,
	}
	if pod.Spec.NodeName != "" {
		meta["node"] = pod.Spec.NodeName
	}
	var containerNames []string
	for _, c := range pod.Spec.Containers {
		containerNames = append(containerNames, c.Name)
	}
	if len(containerNames) > 0 {
		meta["containers"] = strings.Join(containerNames, ",")
	}
	ready := 0
	for _, cs := range pod.Status.ContainerStatuses {
		if cs.Ready {
			ready++
		}
	}
	meta["ready"] = fmt.Sprintf("%d/%d", ready, len(pod.Status.ContainerStatuses))

	return provider.Instance{
		ID:       pod.Name,
		Name:     pod.Name,
		Status:   string(pod.Status.Phase),
		Metadata: meta,
	}
}

func (p *Provider) Stream(ctx context.Context, instance string, opts provider.StreamOpts) (<-chan provider.LogEntry, error) {
	containers, err := p.resolveContainers(ctx, instance)
	if err != nil {
		return nil, err
	}

	ch := make(chan provider.LogEntry, 100)

	var wg sync.WaitGroup
	for _, c := range containers {
		wg.Add(1)
		go func(containerName string) {
			defer wg.Done()
			p.streamContainer(ctx, instance, containerName, opts, ch)
		}(c)
	}

	go func() {
		wg.Wait()
		close(ch)
	}()

	return ch, nil
}

func (p *Provider) streamContainer(ctx context.Context, pod, container string, opts provider.StreamOpts, ch chan<- provider.LogEntry) {
	logOpts := &corev1.PodLogOptions{
		Container:  container,
		Timestamps: true,
		Follow:     opts.Follow,
		Previous:   p.previous,
	}
	if p.tailLines > 0 {
		tail := int64(p.tailLines)
		logOpts.TailLines = &tail
	}
	if !opts.Since.IsZero() {
		since := metav1.NewTime(opts.Since)
		logOpts.SinceTime = &since
	}

	stream, err := p.clientset.CoreV1().Pods(p.namespace).GetLogs(pod, logOpts).Stream(ctx)
	if err != nil {
		select {
		case ch <- provider.LogEntry{
			Timestamp: time.Now(),
			Source:    "kubernetes",
			Instance:  pod,
			Line:      fmt.Sprintf("[error] stream %s/%s: %v", pod, container, err),
			Metadata:  map[string]string{"namespace": p.namespace, "pod": pod, "container": container, "error": "true"},
		}:
		case <-ctx.Done():
		}
		return
	}
	defer stream.Close()

	scanner := bufio.NewScanner(stream)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		ts, logLine := parseKubeTimestamp(line)

		select {
		case ch <- provider.LogEntry{
			Timestamp: ts,
			Source:    "kubernetes",
			Instance:  pod,
			Line:      logLine,
			Raw:       []byte(line),
			Metadata: map[string]string{
				"namespace": p.namespace,
				"pod":       pod,
				"container": container,
			},
		}:
		case <-ctx.Done():
			return
		}
	}
}

func (p *Provider) Fetch(ctx context.Context, instance string, opts provider.FetchOpts) ([]provider.LogEntry, error) {
	containers, err := p.resolveContainers(ctx, instance)
	if err != nil {
		return nil, err
	}

	var allEntries []provider.LogEntry

	for _, container := range containers {
		logOpts := &corev1.PodLogOptions{
			Container:  container,
			Timestamps: true,
			Previous:   p.previous,
		}
		if opts.Lines > 0 {
			tail := int64(opts.Lines)
			logOpts.TailLines = &tail
		}
		if !opts.Since.IsZero() {
			since := metav1.NewTime(opts.Since)
			logOpts.SinceTime = &since
		}

		result := p.clientset.CoreV1().Pods(p.namespace).GetLogs(instance, logOpts).Do(ctx)
		raw, doErr := result.Raw()
		if doErr != nil {
			return nil, fmt.Errorf("fetching logs from %s/%s: %w", instance, container, doErr)
		}

		for _, line := range strings.Split(string(raw), "\n") {
			if line == "" {
				continue
			}
			ts, logLine := parseKubeTimestamp(line)
			allEntries = append(allEntries, provider.LogEntry{
				Timestamp: ts,
				Source:    "kubernetes",
				Instance:  instance,
				Line:      logLine,
				Raw:       []byte(line),
				Metadata: map[string]string{
					"namespace": p.namespace,
					"pod":       instance,
					"container": container,
				},
			})
		}
	}

	return allEntries, nil
}

func (p *Provider) Close() error {
	p.clientset = nil
	p.restConfig = nil
	return nil
}

func (p *Provider) resolveWorkloadSelector(ctx context.Context) error {
	switch {
	case p.deployment != "":
		deploy, err := p.clientset.AppsV1().Deployments(p.namespace).Get(ctx, p.deployment, metav1.GetOptions{})
		if err != nil {
			return fmt.Errorf("deployment %q in %s: %w", p.deployment, p.namespace, err)
		}
		p.selector = labels.Set(deploy.Spec.Selector.MatchLabels).String()

	case p.statefulset != "":
		sts, err := p.clientset.AppsV1().StatefulSets(p.namespace).Get(ctx, p.statefulset, metav1.GetOptions{})
		if err != nil {
			return fmt.Errorf("statefulset %q in %s: %w", p.statefulset, p.namespace, err)
		}
		p.selector = labels.Set(sts.Spec.Selector.MatchLabels).String()

	case p.daemonset != "":
		ds, err := p.clientset.AppsV1().DaemonSets(p.namespace).Get(ctx, p.daemonset, metav1.GetOptions{})
		if err != nil {
			return fmt.Errorf("daemonset %q in %s: %w", p.daemonset, p.namespace, err)
		}
		p.selector = labels.Set(ds.Spec.Selector.MatchLabels).String()

	case p.pod != "":
		// Direct pod name — ListInstances will filter to just this pod
	}

	return nil
}

func (p *Provider) resolveContainers(ctx context.Context, podName string) ([]string, error) {
	if p.container != "" {
		return []string{p.container}, nil
	}

	pod, err := p.clientset.CoreV1().Pods(p.namespace).Get(ctx, podName, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("getting pod %s: %w", podName, err)
	}

	if !p.allContainers {
		if len(pod.Spec.Containers) > 0 {
			return []string{pod.Spec.Containers[0].Name}, nil
		}
		return nil, fmt.Errorf("pod %s has no containers", podName)
	}

	var names []string
	for _, c := range pod.Spec.InitContainers {
		names = append(names, c.Name)
	}
	for _, c := range pod.Spec.Containers {
		names = append(names, c.Name)
	}
	return names, nil
}

func (p *Provider) parseConfig(config map[string]any) {
	if v, ok := config["kubeconfig"].(string); ok {
		p.kubeconfig = v
	}
	if v, ok := config["kubeconfig_content"].(string); ok {
		p.kubeconfigContent = v
	}
	if v, ok := config["context"].(string); ok {
		p.contextName = v
	}
	if v, ok := config["namespace"].(string); ok {
		p.namespace = v
	}
	if v, ok := config["selector"].(string); ok {
		p.selector = v
	}
	if v, ok := config["container"].(string); ok {
		p.container = v
	}
	if v, ok := config["all_containers"].(bool); ok {
		p.allContainers = v
	}
	if v, ok := config["previous"].(bool); ok {
		p.previous = v
	}
	if v, ok := config["proxy_url"].(string); ok {
		p.proxyURL = v
	}
	if v, ok := config["bearer_token"].(string); ok {
		p.bearerToken = v
	}
	if v, ok := config["insecure_skip_tls"].(bool); ok {
		p.insecureSkipTLS = v
	}
	if v, ok := config["ca_cert"].(string); ok {
		if decoded, err := base64.StdEncoding.DecodeString(v); err == nil {
			p.caCert = string(decoded)
		} else {
			p.caCert = v
		}
	}
	if v, ok := config["api_server_url"].(string); ok {
		p.apiServerURL = v
	}
	if v, ok := config["deployment"].(string); ok {
		p.deployment = v
	}
	if v, ok := config["statefulset"].(string); ok {
		p.statefulset = v
	}
	if v, ok := config["daemonset"].(string); ok {
		p.daemonset = v
	}
	if v, ok := config["pod"].(string); ok {
		p.pod = v
	}
	switch v := config["tail_lines"].(type) {
	case int:
		p.tailLines = v
	case float64:
		p.tailLines = int(v)
	case string:
		if v != "" {
			fmt.Sscanf(v, "%d", &p.tailLines)
		}
	}

	if p.namespace == "" {
		p.namespace = "default"
	}
}

func parseKubeTimestamp(line string) (time.Time, string) {
	if len(line) > 30 {
		spaceIdx := strings.Index(line, " ")
		if spaceIdx > 0 && spaceIdx < 40 {
			ts, err := time.Parse(time.RFC3339Nano, line[:spaceIdx])
			if err == nil {
				return ts, line[spaceIdx+1:]
			}
		}
	}
	return time.Now(), line
}
