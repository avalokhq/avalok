package azurefile

import (
	"context"
	"fmt"
	"io"
	"strings"

	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azfile/directory"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azfile/file"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azfile/service"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azfile/share"

	"github.com/avalokhq/avalok/internal/provider"
	"github.com/avalokhq/avalok/internal/provider/cloudutil"
)

func init() {
	provider.Register("azure-file", func() provider.Provider {
		return &Provider{}
	})
}

type Provider struct {
	serviceClient *service.Client
	shareName     string
	directory     string
	cfg           cloudutil.CommonConfig
}

func (p *Provider) Connect(ctx context.Context, config map[string]any) error {
	shareName, ok := config["share_name"].(string)
	if !ok || shareName == "" {
		return fmt.Errorf("azure-file provider: 'share_name' config is required")
	}
	p.shareName = shareName
	p.directory, _ = config["directory"].(string)
	p.cfg = cloudutil.ParseCommonConfig(config)

	connStr, _ := config["connection_string"].(string)
	accountName, _ := config["account_name"].(string)
	accountKey, _ := config["account_key"].(string)
	sasToken, _ := config["sas_token"].(string)

	var err error

	switch {
	case connStr != "":
		p.serviceClient, err = service.NewClientFromConnectionString(connStr, nil)
	case accountName != "" && accountKey != "":
		cred, credErr := service.NewSharedKeyCredential(accountName, accountKey)
		if credErr != nil {
			return fmt.Errorf("azure-file provider: invalid credentials: %w", credErr)
		}
		serviceURL := fmt.Sprintf("https://%s.file.core.windows.net", accountName)
		p.serviceClient, err = service.NewClientWithSharedKeyCredential(serviceURL, cred, nil)
	case accountName != "" && sasToken != "":
		serviceURL := fmt.Sprintf("https://%s.file.core.windows.net?%s", accountName, sasToken)
		p.serviceClient, err = service.NewClientWithNoCredential(serviceURL, nil)
	case accountName != "":
		cred, credErr := azidentity.NewDefaultAzureCredential(nil)
		if credErr != nil {
			return fmt.Errorf("azure-file provider: default credential: %w", credErr)
		}
		serviceURL := fmt.Sprintf("https://%s.file.core.windows.net", accountName)
		p.serviceClient, err = service.NewClient(serviceURL, cred, nil)
	default:
		return fmt.Errorf("azure-file provider: 'connection_string' or 'account_name' is required")
	}

	if err != nil {
		return fmt.Errorf("azure-file provider: creating client: %w", err)
	}

	shareClient := p.serviceClient.NewShareClient(p.shareName)
	_, err = shareClient.GetProperties(ctx, &share.GetPropertiesOptions{})
	if err != nil {
		return fmt.Errorf("azure-file provider: share %q not accessible: %w", p.shareName, err)
	}

	return nil
}

func (p *Provider) ListInstances(ctx context.Context) ([]provider.Instance, error) {
	objects, err := cloudutil.ListAndFilter(ctx, p, p.cfg)
	if err != nil {
		return nil, fmt.Errorf("azure-file provider: %w", err)
	}
	return cloudutil.ObjectsToInstances(objects), nil
}

func (p *Provider) Stream(ctx context.Context, instance string, opts provider.StreamOpts) (<-chan provider.LogEntry, error) {
	ch := make(chan provider.LogEntry, 100)

	go func() {
		defer close(ch)
		cloudutil.PollAndStream(ctx, p, p.cfg, "azure-file", instance, opts, ch)
	}()

	return ch, nil
}

func (p *Provider) Fetch(ctx context.Context, instance string, opts provider.FetchOpts) ([]provider.LogEntry, error) {
	return cloudutil.FetchFromStore(ctx, p, instance, "azure-file", opts)
}

func (p *Provider) Close() error {
	return nil
}

func (p *Provider) ListObjects(ctx context.Context, _ string) ([]cloudutil.ObjectInfo, error) {
	shareClient := p.serviceClient.NewShareClient(p.shareName)
	dirPath := p.directory
	if dirPath == "" {
		dirPath = ""
	}

	return p.listFilesRecursive(ctx, shareClient, dirPath, "")
}

func (p *Provider) listFilesRecursive(ctx context.Context, shareClient *share.Client, dirPath string, keyPrefix string) ([]cloudutil.ObjectInfo, error) {
	var dirClient *directory.Client
	if dirPath == "" {
		dirClient = shareClient.NewRootDirectoryClient()
	} else {
		dirClient = shareClient.NewDirectoryClient(dirPath)
	}

	var objects []cloudutil.ObjectInfo

	pager := dirClient.NewListFilesAndDirectoriesPager(&directory.ListFilesAndDirectoriesOptions{})
	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("listing files in %q: %w", dirPath, err)
		}

		for _, dir := range page.Segment.Directories {
			subDir := *dir.Name
			subPath := subDir
			if dirPath != "" {
				subPath = dirPath + "/" + subDir
			}
			subKey := subDir
			if keyPrefix != "" {
				subKey = keyPrefix + "/" + subDir
			}
			subObjects, err := p.listFilesRecursive(ctx, shareClient, subPath, subKey)
			if err != nil {
				return nil, err
			}
			objects = append(objects, subObjects...)
		}

		for _, f := range page.Segment.Files {
			key := *f.Name
			if keyPrefix != "" {
				key = keyPrefix + "/" + *f.Name
			}
			var size int64
			if f.Properties != nil && f.Properties.ContentLength != nil {
				size = *f.Properties.ContentLength
			}
			objects = append(objects, cloudutil.ObjectInfo{
				Key:  key,
				Size: size,
			})
		}
	}

	return objects, nil
}

func (p *Provider) ListHierarchical(ctx context.Context, path string) (*cloudutil.ListResult, error) {
	result := &cloudutil.ListResult{Path: path}

	shareClient := p.serviceClient.NewShareClient(p.shareName)
	dirPath := path
	if p.directory != "" {
		if path == "" {
			dirPath = p.directory
		} else {
			dirPath = p.directory + "/" + strings.TrimSuffix(path, "/")
		}
	} else {
		dirPath = strings.TrimSuffix(path, "/")
	}

	var dirClient *directory.Client
	if dirPath == "" {
		dirClient = shareClient.NewRootDirectoryClient()
	} else {
		dirClient = shareClient.NewDirectoryClient(dirPath)
	}

	pager := dirClient.NewListFilesAndDirectoriesPager(&directory.ListFilesAndDirectoriesOptions{})
	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("listing directory %q: %w", dirPath, err)
		}

		for _, dir := range page.Segment.Directories {
			name := *dir.Name
			result.Directories = append(result.Directories, cloudutil.DirectoryEntry{
				Name: name,
				Path: path + name + "/",
			})
		}

		for _, f := range page.Segment.Files {
			key := path + *f.Name
			var size int64
			if f.Properties != nil && f.Properties.ContentLength != nil {
				size = *f.Properties.ContentLength
			}
			obj := cloudutil.ObjectInfo{
				Key:  key,
				Size: size,
			}
			if cloudutil.MatchPattern(key, p.cfg.Pattern) {
				result.Objects = append(result.Objects, obj)
			}
		}
	}

	return result, nil
}

func (p *Provider) GetObject(ctx context.Context, key string) (io.ReadCloser, error) {
	filePath := key
	if p.directory != "" {
		filePath = p.directory + "/" + key
	}

	shareClient := p.serviceClient.NewShareClient(p.shareName)
	parts := strings.Split(filePath, "/")
	dirPath := strings.Join(parts[:len(parts)-1], "/")
	fileName := parts[len(parts)-1]

	var fileClient *file.Client
	if dirPath == "" {
		fileClient = shareClient.NewRootDirectoryClient().NewFileClient(fileName)
	} else {
		fileClient = shareClient.NewDirectoryClient(dirPath).NewFileClient(fileName)
	}

	resp, err := fileClient.DownloadStream(ctx, &file.DownloadStreamOptions{})
	if err != nil {
		return nil, err
	}
	return resp.Body, nil
}

func (p *Provider) GetObjectRange(ctx context.Context, key string, offset int64) (io.ReadCloser, error) {
	filePath := key
	if p.directory != "" {
		filePath = p.directory + "/" + key
	}

	shareClient := p.serviceClient.NewShareClient(p.shareName)
	parts := strings.Split(filePath, "/")
	dirPath := strings.Join(parts[:len(parts)-1], "/")
	fileName := parts[len(parts)-1]

	var fileClient *file.Client
	if dirPath == "" {
		fileClient = shareClient.NewRootDirectoryClient().NewFileClient(fileName)
	} else {
		fileClient = shareClient.NewDirectoryClient(dirPath).NewFileClient(fileName)
	}

	resp, err := fileClient.DownloadStream(ctx, &file.DownloadStreamOptions{
		Range: file.HTTPRange{Offset: offset},
	})
	if err != nil {
		return nil, err
	}
	return resp.Body, nil
}
