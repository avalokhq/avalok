package discovery

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"

	"github.com/avalokhq/avalok/internal/workspace"
)

var systemNamespaces = map[string]bool{
	"kube-system":     true,
	"kube-public":     true,
	"kube-node-lease": true,
}

type Options struct {
	Kubeconfig    string
	Contexts      []string
	Namespaces    []string
	AllNamespaces bool
}

type workload struct {
	name string
	kind string
}

func DiscoverKubernetes(ctx context.Context, opts Options) ([]*workspace.Workspace, error) {
	loadingRules := clientcmd.NewDefaultClientConfigLoadingRules()
	if opts.Kubeconfig != "" {
		loadingRules.ExplicitPath = opts.Kubeconfig
	}

	rawConfig, err := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		loadingRules, &clientcmd.ConfigOverrides{},
	).RawConfig()
	if err != nil {
		return nil, fmt.Errorf("loading kubeconfig: %w", err)
	}

	contexts := filterContexts(&rawConfig, opts.Contexts)
	if len(contexts) == 0 {
		return nil, fmt.Errorf("no kubernetes contexts found")
	}

	usedNames := make(map[string]bool)
	var workspaces []*workspace.Workspace

	for _, ctxName := range contexts {
		fmt.Printf("  Discovering cluster: %s ...\n", ctxName)

		ws, err := discoverContext(ctx, loadingRules, ctxName, opts)
		if err != nil {
			fmt.Printf("    \033[33m!\033[0m skipping: %v\n", err)
			continue
		}
		if ws == nil {
			continue
		}

		ws.Name = uniqueName(ws.Name, usedNames)
		workspaces = append(workspaces, ws)
	}

	if len(workspaces) == 0 {
		return nil, fmt.Errorf("no reachable kubernetes clusters with workloads found")
	}

	return workspaces, nil
}

func discoverContext(ctx context.Context, loadingRules *clientcmd.ClientConfigLoadingRules, ctxName string, opts Options) (*workspace.Workspace, error) {
	overrides := &clientcmd.ConfigOverrides{CurrentContext: ctxName}

	restConfig, err := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		loadingRules, overrides,
	).ClientConfig()
	if err != nil {
		return nil, fmt.Errorf("building config: %w", err)
	}

	restConfig.Timeout = 10 * time.Second

	clientset, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("creating client: %w", err)
	}

	if _, err = clientset.Discovery().ServerVersion(); err != nil {
		return nil, fmt.Errorf("cluster unreachable: %w", err)
	}

	nsList, err := clientset.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("listing namespaces: %w", err)
	}

	var namespaces []string
	for _, ns := range nsList.Items {
		name := ns.Name
		if len(opts.Namespaces) > 0 {
			if !contains(opts.Namespaces, name) {
				continue
			}
		} else if !opts.AllNamespaces && systemNamespaces[name] {
			continue
		}
		namespaces = append(namespaces, name)
	}
	sort.Strings(namespaces)

	if len(namespaces) == 0 {
		return nil, nil
	}

	type nsData struct {
		workloads []workload
	}
	nsMap := make(map[string]*nsData)
	nameKinds := make(map[string]map[string]bool)

	for _, ns := range namespaces {
		data := &nsData{}

		if deploys, err := clientset.AppsV1().Deployments(ns).List(ctx, metav1.ListOptions{}); err == nil {
			for _, d := range deploys.Items {
				data.workloads = append(data.workloads, workload{name: d.Name, kind: "deployment"})
			}
		}

		if stsList, err := clientset.AppsV1().StatefulSets(ns).List(ctx, metav1.ListOptions{}); err == nil {
			for _, s := range stsList.Items {
				data.workloads = append(data.workloads, workload{name: s.Name, kind: "statefulset"})
			}
		}

		if dsList, err := clientset.AppsV1().DaemonSets(ns).List(ctx, metav1.ListOptions{}); err == nil {
			for _, d := range dsList.Items {
				data.workloads = append(data.workloads, workload{name: d.Name, kind: "daemonset"})
			}
		}

		if len(data.workloads) > 0 {
			nsMap[ns] = data
			for _, w := range data.workloads {
				if nameKinds[w.name] == nil {
					nameKinds[w.name] = make(map[string]bool)
				}
				nameKinds[w.name][w.kind] = true
			}
		}
	}

	needsSuffix := make(map[string]bool)
	for name, kinds := range nameKinds {
		if len(kinds) > 1 {
			needsSuffix[name] = true
		}
	}

	svcKey := func(w workload) string {
		if needsSuffix[w.name] {
			return w.name + "-" + kindShort[w.kind]
		}
		return w.name
	}

	seenSvcs := make(map[string]bool)
	var services []workspace.Service
	var environments []workspace.Environment
	totalWorkloads := 0

	for _, ns := range namespaces {
		data, ok := nsMap[ns]
		if !ok {
			continue
		}

		var svcNames []string
		for _, w := range data.workloads {
			name := svcKey(w)
			if !seenSvcs[name] {
				seenSvcs[name] = true
				services = append(services, workspace.Service{
					Name:     name,
					Provider: "kubernetes",
					Config: map[string]any{
						w.kind: w.name,
					},
				})
			}
			svcNames = append(svcNames, name)
			totalWorkloads++
		}

		target := workspace.Target{
			Name:         ns,
			Type:         "kubernetes",
			Context:      ctxName,
			Namespace:    ns,
			ServiceNames: svcNames,
		}
		if opts.Kubeconfig != "" {
			target.Kubeconfig = opts.Kubeconfig
		}

		environments = append(environments, workspace.Environment{
			Name:    ns,
			Targets: []workspace.Target{target},
		})
	}

	if len(services) == 0 {
		fmt.Printf("    no workloads found\n")
		return nil, nil
	}

	fmt.Printf("    found %d namespaces, %d workloads\n", len(environments), totalWorkloads)

	wsName := sanitizeContextName(ctxName)
	description := fmt.Sprintf("Auto-discovered from context %s", ctxName)
	if provider := detectCloudProvider(ctxName); provider != "" {
		description = fmt.Sprintf("%s cluster (auto-discovered)", provider)
	}

	return &workspace.Workspace{
		Name:         wsName,
		Description:  description,
		Services:     services,
		Environments: environments,
	}, nil
}

var kindShort = map[string]string{
	"deployment":  "deploy",
	"statefulset": "sts",
	"daemonset":   "ds",
}

func filterContexts(config *clientcmdapi.Config, filter []string) []string {
	if len(filter) > 0 {
		var result []string
		for _, f := range filter {
			if _, ok := config.Contexts[f]; ok {
				result = append(result, f)
			}
		}
		return result
	}

	var names []string
	for name := range config.Contexts {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func sanitizeContextName(name string) string {
	// EKS ARN: arn:aws:eks:region:account:cluster/name
	if strings.HasPrefix(name, "arn:") {
		if idx := strings.LastIndex(name, ":cluster/"); idx >= 0 {
			clusterName := name[idx+len(":cluster/"):]
			parts := strings.Split(name, ":")
			if len(parts) >= 4 {
				return parts[3] + "-" + clusterName
			}
			return clusterName
		}
	}

	// GKE: gke_project_zone_name
	if strings.HasPrefix(name, "gke_") {
		parts := strings.Split(name, "_")
		if len(parts) >= 4 {
			return parts[2] + "-" + parts[len(parts)-1]
		}
	}

	r := strings.NewReplacer(":", "-", "/", "-", "@", "-", " ", "-")
	sanitized := r.Replace(name)
	for strings.Contains(sanitized, "--") {
		sanitized = strings.ReplaceAll(sanitized, "--", "-")
	}
	return strings.Trim(sanitized, "-")
}

func detectCloudProvider(contextName string) string {
	lower := strings.ToLower(contextName)
	switch {
	case strings.Contains(lower, "aks") || strings.Contains(lower, "azure"):
		return "AKS"
	case strings.Contains(lower, "eks") || strings.Contains(lower, "aws"):
		return "EKS"
	case strings.Contains(lower, "gke") || strings.Contains(lower, "gcp") || strings.Contains(lower, "google"):
		return "GKE"
	case strings.Contains(lower, "minikube"):
		return "Minikube"
	case strings.Contains(lower, "kind"):
		return "Kind"
	case strings.Contains(lower, "k3s") || strings.Contains(lower, "k3d"):
		return "K3s"
	case strings.Contains(lower, "rancher"):
		return "Rancher"
	case strings.Contains(lower, "docker-desktop") || strings.Contains(lower, "docker"):
		return "Docker Desktop"
	default:
		return ""
	}
}

func uniqueName(name string, used map[string]bool) string {
	if !used[name] {
		used[name] = true
		return name
	}
	for i := 2; ; i++ {
		candidate := fmt.Sprintf("%s-%d", name, i)
		if !used[candidate] {
			used[candidate] = true
			return candidate
		}
	}
}

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}
