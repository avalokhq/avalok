package gcs

import (
	"context"
	"fmt"
	"io"
	"strings"

	"cloud.google.com/go/storage"
	"google.golang.org/api/iterator"
	"google.golang.org/api/option"

	"github.com/avalokhq/avalok/internal/provider"
	"github.com/avalokhq/avalok/internal/provider/cloudutil"
)

func init() {
	provider.Register("gcs", func() provider.Provider {
		return &Provider{}
	})
}

type Provider struct {
	client *storage.Client
	bucket string
	cfg    cloudutil.CommonConfig
}

func (p *Provider) Connect(ctx context.Context, config map[string]any) error {
	bucket, ok := config["bucket"].(string)
	if !ok || bucket == "" {
		return fmt.Errorf("gcs provider: 'bucket' config is required")
	}
	p.bucket = bucket
	p.cfg = cloudutil.ParseCommonConfig(config)

	var opts []option.ClientOption

	if credsJSON, ok := config["credentials_json"].(string); ok && credsJSON != "" {
		opts = append(opts, option.WithCredentialsJSON([]byte(credsJSON)))
	} else if credsFile, ok := config["credentials_file"].(string); ok && credsFile != "" {
		opts = append(opts, option.WithCredentialsFile(credsFile))
	}

	var err error
	p.client, err = storage.NewClient(ctx, opts...)
	if err != nil {
		return fmt.Errorf("gcs provider: creating client: %w", err)
	}

	_, err = p.client.Bucket(p.bucket).Attrs(ctx)
	if err != nil {
		p.client.Close()
		return fmt.Errorf("gcs provider: bucket %q not accessible: %w", p.bucket, err)
	}

	return nil
}

func (p *Provider) ListInstances(ctx context.Context) ([]provider.Instance, error) {
	objects, err := cloudutil.ListAndFilter(ctx, p, p.cfg)
	if err != nil {
		return nil, fmt.Errorf("gcs provider: %w", err)
	}
	return cloudutil.ObjectsToInstances(objects), nil
}

func (p *Provider) Stream(ctx context.Context, instance string, opts provider.StreamOpts) (<-chan provider.LogEntry, error) {
	ch := make(chan provider.LogEntry, 100)

	go func() {
		defer close(ch)
		cloudutil.PollAndStream(ctx, p, p.cfg, "gcs", instance, opts, ch)
	}()

	return ch, nil
}

func (p *Provider) Fetch(ctx context.Context, instance string, opts provider.FetchOpts) ([]provider.LogEntry, error) {
	return cloudutil.FetchFromStore(ctx, p, instance, "gcs", opts)
}

func (p *Provider) Close() error {
	if p.client != nil {
		return p.client.Close()
	}
	return nil
}

func (p *Provider) ListObjects(ctx context.Context, prefix string) ([]cloudutil.ObjectInfo, error) {
	var objects []cloudutil.ObjectInfo

	query := &storage.Query{}
	if prefix != "" {
		query.Prefix = prefix
	}

	it := p.client.Bucket(p.bucket).Objects(ctx, query)
	for {
		attrs, err := it.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("listing objects: %w", err)
		}
		objects = append(objects, cloudutil.ObjectInfo{
			Key:          attrs.Name,
			Size:         attrs.Size,
			LastModified: attrs.Updated,
		})
	}

	return objects, nil
}

func (p *Provider) ListHierarchical(ctx context.Context, path string) (*cloudutil.ListResult, error) {
	result := &cloudutil.ListResult{Path: path}

	prefix := path
	if p.cfg.Prefix != "" {
		prefix = p.cfg.Prefix + path
	}

	query := &storage.Query{
		Delimiter: "/",
	}
	if prefix != "" {
		query.Prefix = prefix
	}

	it := p.client.Bucket(p.bucket).Objects(ctx, query)
	for {
		attrs, err := it.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("listing objects: %w", err)
		}
		if attrs.Prefix != "" {
			name := attrs.Prefix
			if prefix != "" && strings.HasPrefix(name, prefix) {
				name = name[len(prefix):]
			}
			name = strings.TrimSuffix(name, "/")
			result.Directories = append(result.Directories, cloudutil.DirectoryEntry{
				Name: name,
				Path: attrs.Prefix,
			})
		} else {
			obj := cloudutil.ObjectInfo{
				Key:          attrs.Name,
				Size:         attrs.Size,
				LastModified: attrs.Updated,
			}
			if cloudutil.MatchPattern(attrs.Name, p.cfg.Pattern) {
				result.Objects = append(result.Objects, obj)
			}
		}
	}

	return result, nil
}

func (p *Provider) GetObject(ctx context.Context, key string) (io.ReadCloser, error) {
	return p.client.Bucket(p.bucket).Object(key).NewReader(ctx)
}

func (p *Provider) GetObjectRange(ctx context.Context, key string, offset int64) (io.ReadCloser, error) {
	return p.client.Bucket(p.bucket).Object(key).NewRangeReader(ctx, offset, -1)
}
