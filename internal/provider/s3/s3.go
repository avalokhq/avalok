package s3

import (
	"context"
	"fmt"
	"io"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"github.com/avalokhq/avalok/internal/provider"
	"github.com/avalokhq/avalok/internal/provider/cloudutil"
)

func init() {
	provider.Register("s3", func() provider.Provider {
		return &Provider{}
	})
}

type Provider struct {
	client *s3.Client
	bucket string
	cfg    cloudutil.CommonConfig
}

func (p *Provider) Connect(ctx context.Context, config map[string]any) error {
	bucket, ok := config["bucket"].(string)
	if !ok || bucket == "" {
		return fmt.Errorf("s3 provider: 'bucket' config is required")
	}
	p.bucket = bucket
	p.cfg = cloudutil.ParseCommonConfig(config)

	var opts []func(*awsconfig.LoadOptions) error

	if region, ok := config["region"].(string); ok && region != "" {
		opts = append(opts, awsconfig.WithRegion(region))
	}

	accessKey, _ := config["access_key_id"].(string)
	secretKey, _ := config["secret_access_key"].(string)
	if accessKey != "" && secretKey != "" {
		opts = append(opts, awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(accessKey, secretKey, ""),
		))
	}

	awsCfg, err := awsconfig.LoadDefaultConfig(ctx, opts...)
	if err != nil {
		return fmt.Errorf("s3 provider: loading AWS config: %w", err)
	}

	var s3Opts []func(*s3.Options)

	if endpoint, ok := config["endpoint"].(string); ok && endpoint != "" {
		s3Opts = append(s3Opts, func(o *s3.Options) {
			o.BaseEndpoint = aws.String(endpoint)
		})
	}

	if forcePathStyle, ok := config["force_path_style"].(bool); ok && forcePathStyle {
		s3Opts = append(s3Opts, func(o *s3.Options) {
			o.UsePathStyle = true
		})
	}

	p.client = s3.NewFromConfig(awsCfg, s3Opts...)

	_, err = p.client.HeadBucket(ctx, &s3.HeadBucketInput{
		Bucket: aws.String(p.bucket),
	})
	if err != nil {
		return fmt.Errorf("s3 provider: bucket %q not accessible: %w", p.bucket, err)
	}

	return nil
}

func (p *Provider) ListInstances(ctx context.Context) ([]provider.Instance, error) {
	objects, err := cloudutil.ListAndFilter(ctx, p, p.cfg)
	if err != nil {
		return nil, fmt.Errorf("s3 provider: %w", err)
	}
	return cloudutil.ObjectsToInstances(objects), nil
}

func (p *Provider) Stream(ctx context.Context, instance string, opts provider.StreamOpts) (<-chan provider.LogEntry, error) {
	ch := make(chan provider.LogEntry, 100)

	go func() {
		defer close(ch)
		cloudutil.PollAndStream(ctx, p, p.cfg, "s3", instance, opts, ch)
	}()

	return ch, nil
}

func (p *Provider) Fetch(ctx context.Context, instance string, opts provider.FetchOpts) ([]provider.LogEntry, error) {
	return cloudutil.FetchFromStore(ctx, p, instance, "s3", opts)
}

func (p *Provider) Close() error {
	return nil
}

func (p *Provider) ListObjects(ctx context.Context, prefix string) ([]cloudutil.ObjectInfo, error) {
	var objects []cloudutil.ObjectInfo

	input := &s3.ListObjectsV2Input{
		Bucket: aws.String(p.bucket),
	}
	if prefix != "" {
		input.Prefix = aws.String(prefix)
	}

	paginator := s3.NewListObjectsV2Paginator(p.client, input)
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("listing objects: %w", err)
		}
		for _, obj := range page.Contents {
			objects = append(objects, cloudutil.ObjectInfo{
				Key:          aws.ToString(obj.Key),
				Size:         aws.ToInt64(obj.Size),
				LastModified: aws.ToTime(obj.LastModified),
			})
		}
	}

	return objects, nil
}

func (p *Provider) ListHierarchical(ctx context.Context, path string) (*cloudutil.ListResult, error) {
	result := &cloudutil.ListResult{Path: path}

	prefix := path
	if p.cfg.Prefix != "" {
		prefix = p.cfg.Prefix + path
	}

	delimiter := "/"
	input := &s3.ListObjectsV2Input{
		Bucket:    aws.String(p.bucket),
		Delimiter: aws.String(delimiter),
	}
	if prefix != "" {
		input.Prefix = aws.String(prefix)
	}

	paginator := s3.NewListObjectsV2Paginator(p.client, input)
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("listing objects: %w", err)
		}

		for _, cp := range page.CommonPrefixes {
			dirPath := aws.ToString(cp.Prefix)
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

		for _, obj := range page.Contents {
			key := aws.ToString(obj.Key)
			o := cloudutil.ObjectInfo{
				Key:          key,
				Size:         aws.ToInt64(obj.Size),
				LastModified: aws.ToTime(obj.LastModified),
			}
			if cloudutil.MatchPattern(key, p.cfg.Pattern) {
				result.Objects = append(result.Objects, o)
			}
		}
	}

	return result, nil
}

func (p *Provider) GetObject(ctx context.Context, key string) (io.ReadCloser, error) {
	out, err := p.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(p.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, err
	}
	return out.Body, nil
}

func (p *Provider) GetObjectRange(ctx context.Context, key string, offset int64) (io.ReadCloser, error) {
	out, err := p.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(p.bucket),
		Key:    aws.String(key),
		Range:  aws.String(fmt.Sprintf("bytes=%d-", offset)),
	})
	if err != nil {
		return nil, err
	}
	return out.Body, nil
}
