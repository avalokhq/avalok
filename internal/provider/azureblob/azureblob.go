package azureblob

import (
	"context"
	"fmt"
	"io"
	"strings"

	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob/container"

	"github.com/avalokhq/avalok/internal/provider"
	"github.com/avalokhq/avalok/internal/provider/cloudutil"
)

func init() {
	provider.Register("azure-blob", func() provider.Provider {
		return &Provider{}
	})
}

type Provider struct {
	client    *azblob.Client
	container string
	cfg       cloudutil.CommonConfig
}

func (p *Provider) Connect(ctx context.Context, config map[string]any) error {
	container, ok := config["container"].(string)
	if !ok || container == "" {
		return fmt.Errorf("azure-blob provider: 'container' config is required")
	}
	p.container = container
	p.cfg = cloudutil.ParseCommonConfig(config)

	connStr, _ := config["connection_string"].(string)
	accountName, _ := config["account_name"].(string)
	accountKey, _ := config["account_key"].(string)
	sasToken, _ := config["sas_token"].(string)

	var err error

	switch {
	case connStr != "":
		p.client, err = azblob.NewClientFromConnectionString(connStr, nil)
	case accountName != "" && accountKey != "":
		cred, credErr := azblob.NewSharedKeyCredential(accountName, accountKey)
		if credErr != nil {
			return fmt.Errorf("azure-blob provider: invalid credentials: %w", credErr)
		}
		serviceURL := fmt.Sprintf("https://%s.blob.core.windows.net", accountName)
		p.client, err = azblob.NewClientWithSharedKeyCredential(serviceURL, cred, nil)
	case accountName != "" && sasToken != "":
		serviceURL := fmt.Sprintf("https://%s.blob.core.windows.net?%s", accountName, sasToken)
		p.client, err = azblob.NewClientWithNoCredential(serviceURL, nil)
	case accountName != "":
		cred, credErr := azidentity.NewDefaultAzureCredential(nil)
		if credErr != nil {
			return fmt.Errorf("azure-blob provider: default credential: %w", credErr)
		}
		serviceURL := fmt.Sprintf("https://%s.blob.core.windows.net", accountName)
		p.client, err = azblob.NewClient(serviceURL, cred, nil)
	default:
		return fmt.Errorf("azure-blob provider: 'connection_string' or 'account_name' is required")
	}

	if err != nil {
		return fmt.Errorf("azure-blob provider: creating client: %w", err)
	}

	pager := p.client.NewListBlobsFlatPager(p.container, &azblob.ListBlobsFlatOptions{
		MaxResults: toPtr(int32(1)),
	})
	_, err = pager.NextPage(ctx)
	if err != nil {
		return fmt.Errorf("azure-blob provider: container %q not accessible: %w", p.container, err)
	}

	return nil
}

func (p *Provider) ListInstances(ctx context.Context) ([]provider.Instance, error) {
	objects, err := cloudutil.ListAndFilter(ctx, p, p.cfg)
	if err != nil {
		return nil, fmt.Errorf("azure-blob provider: %w", err)
	}
	return cloudutil.ObjectsToInstances(objects), nil
}

func (p *Provider) Stream(ctx context.Context, instance string, opts provider.StreamOpts) (<-chan provider.LogEntry, error) {
	ch := make(chan provider.LogEntry, 100)

	go func() {
		defer close(ch)
		cloudutil.PollAndStream(ctx, p, p.cfg, "azure-blob", instance, opts, ch)
	}()

	return ch, nil
}

func (p *Provider) Fetch(ctx context.Context, instance string, opts provider.FetchOpts) ([]provider.LogEntry, error) {
	return cloudutil.FetchFromStore(ctx, p, instance, "azure-blob", opts)
}

func (p *Provider) Close() error {
	return nil
}

func (p *Provider) ListObjects(ctx context.Context, prefix string) ([]cloudutil.ObjectInfo, error) {
	var objects []cloudutil.ObjectInfo

	opts := &azblob.ListBlobsFlatOptions{}
	if prefix != "" {
		opts.Prefix = &prefix
	}

	pager := p.client.NewListBlobsFlatPager(p.container, opts)
	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("listing blobs: %w", err)
		}
		for _, blob := range page.Segment.BlobItems {
			var size int64
			if blob.Properties.ContentLength != nil {
				size = *blob.Properties.ContentLength
			}
			var lastModified = blob.Properties.LastModified
			obj := cloudutil.ObjectInfo{
				Key:  *blob.Name,
				Size: size,
			}
			if lastModified != nil {
				obj.LastModified = *lastModified
			}
			objects = append(objects, obj)
		}
	}

	return objects, nil
}

func (p *Provider) ListHierarchical(ctx context.Context, path string) (*cloudutil.ListResult, error) {
	result := &cloudutil.ListResult{Path: path}

	prefix := path
	if p.cfg.Prefix != "" && !strings.HasPrefix(path, p.cfg.Prefix) {
		prefix = p.cfg.Prefix + path
	}

	containerClient := p.client.ServiceClient().NewContainerClient(p.container)
	opts := &container.ListBlobsHierarchyOptions{}
	if prefix != "" {
		opts.Prefix = &prefix
	}

	pager := containerClient.NewListBlobsHierarchyPager("/", opts)
	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("listing blobs: %w", err)
		}

		for _, bp := range page.Segment.BlobPrefixes {
			dirPath := *bp.Name
			name := dirPath
			if prefix != "" && strings.HasPrefix(name, prefix) {
				name = name[len(prefix):]
			}
			name = strings.TrimSuffix(name, "/")
			result.Directories = append(result.Directories, cloudutil.DirectoryEntry{
				Name: name,
				Path: dirPath,
			})
		}

		for _, blob := range page.Segment.BlobItems {
			var size int64
			if blob.Properties.ContentLength != nil {
				size = *blob.Properties.ContentLength
			}
			key := *blob.Name
			obj := cloudutil.ObjectInfo{
				Key:  key,
				Size: size,
			}
			if blob.Properties.LastModified != nil {
				obj.LastModified = *blob.Properties.LastModified
			}
			if cloudutil.MatchPattern(key, p.cfg.Pattern) {
				result.Objects = append(result.Objects, obj)
			}
		}
	}

	return result, nil
}

func (p *Provider) GetObject(ctx context.Context, key string) (io.ReadCloser, error) {
	resp, err := p.client.DownloadStream(ctx, p.container, key, nil)
	if err != nil {
		return nil, err
	}
	return resp.Body, nil
}

func (p *Provider) GetObjectRange(ctx context.Context, key string, offset int64) (io.ReadCloser, error) {
	resp, err := p.client.DownloadStream(ctx, p.container, key, &azblob.DownloadStreamOptions{
		Range: azblob.HTTPRange{Offset: offset},
	})
	if err != nil {
		return nil, err
	}
	return resp.Body, nil
}

func toPtr[T any](v T) *T {
	return &v
}
