package cloudutil

import (
	"bufio"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"time"

	"github.com/avalokhq/avalok/internal/provider"
)

type ObjectInfo struct {
	Key          string
	Size         int64
	LastModified time.Time
}

type ObjectStore interface {
	ListObjects(ctx context.Context, prefix string) ([]ObjectInfo, error)
	GetObject(ctx context.Context, key string) (io.ReadCloser, error)
	GetObjectRange(ctx context.Context, key string, offset int64) (io.ReadCloser, error)
}

type DirectoryEntry struct {
	Name string
	Path string
}

type ListResult struct {
	Path        string
	Directories []DirectoryEntry
	Objects     []ObjectInfo
}

type HierarchicalStore interface {
	ObjectStore
	ListHierarchical(ctx context.Context, path string) (*ListResult, error)
}

type CommonConfig struct {
	Prefix       string
	Pattern      string
	PollInterval time.Duration
}

func ParseCommonConfig(config map[string]any) CommonConfig {
	c := CommonConfig{
		PollInterval: 30 * time.Second,
	}

	if v, ok := config["prefix"].(string); ok {
		c.Prefix = v
	}
	if v, ok := config["pattern"].(string); ok {
		c.Pattern = v
	}

	if v, ok := config["poll_interval"]; ok {
		switch val := v.(type) {
		case int:
			c.PollInterval = time.Duration(val) * time.Second
		case float64:
			c.PollInterval = time.Duration(int(val)) * time.Second
		case string:
			if d, err := time.ParseDuration(val); err == nil {
				c.PollInterval = d
			}
		}
	}

	if c.PollInterval < 5*time.Second {
		c.PollInterval = 5 * time.Second
	}

	return c
}

func MatchPattern(key, pattern string) bool {
	if pattern == "" {
		return true
	}
	base := filepath.Base(key)
	matched, err := filepath.Match(pattern, base)
	if err != nil {
		return false
	}
	return matched
}

func ObjectsToInstances(objects []ObjectInfo) []provider.Instance {
	instances := make([]provider.Instance, len(objects))
	for i, obj := range objects {
		instances[i] = provider.Instance{
			ID:     obj.Key,
			Name:   filepath.Base(obj.Key),
			Status: "available",
			Metadata: map[string]string{
				"size":          fmt.Sprintf("%d", obj.Size),
				"last_modified": obj.LastModified.Format(time.RFC3339),
			},
		}
	}
	return instances
}

func ListAndFilter(ctx context.Context, store ObjectStore, cfg CommonConfig) ([]ObjectInfo, error) {
	objects, err := store.ListObjects(ctx, cfg.Prefix)
	if err != nil {
		return nil, err
	}

	if cfg.Pattern == "" {
		return objects, nil
	}

	filtered := make([]ObjectInfo, 0, len(objects))
	for _, obj := range objects {
		if MatchPattern(obj.Key, cfg.Pattern) {
			filtered = append(filtered, obj)
		}
	}
	return filtered, nil
}

func ReadLines(r io.Reader, source, instance string) ([]provider.LogEntry, error) {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	var entries []provider.LogEntry
	for scanner.Scan() {
		line := scanner.Text()
		entries = append(entries, provider.LogEntry{
			Timestamp: time.Now(),
			Source:    source,
			Instance:  instance,
			Line:      line,
			Raw:       []byte(line),
		})
	}
	return entries, scanner.Err()
}

func FetchFromStore(ctx context.Context, store ObjectStore, key string, source string, opts provider.FetchOpts) ([]provider.LogEntry, error) {
	rc, err := store.GetObject(ctx, key)
	if err != nil {
		return nil, fmt.Errorf("downloading %q: %w", key, err)
	}
	defer rc.Close()

	var reader io.Reader = rc
	if isGzip(key) {
		gz, err := gzip.NewReader(rc)
		if err != nil {
			return nil, fmt.Errorf("decompressing %q: %w", key, err)
		}
		defer gz.Close()
		reader = gz
	}

	instance := filepath.Base(key)
	entries, err := ReadLines(reader, source, instance)
	if err != nil {
		return nil, err
	}

	if opts.Lines > 0 && len(entries) > opts.Lines {
		entries = entries[len(entries)-opts.Lines:]
	}

	return entries, nil
}

type objectState struct {
	size         int64
	lastModified time.Time
	offset       int64
}

func PollAndStream(ctx context.Context, store ObjectStore, cfg CommonConfig, source string, instance string, opts provider.StreamOpts, ch chan<- provider.LogEntry) {
	tracked := make(map[string]*objectState)

	sendEntry := func(line string) bool {
		select {
		case ch <- provider.LogEntry{
			Timestamp: time.Now(),
			Source:    source,
			Instance:  instance,
			Line:      line,
			Raw:       []byte(line),
		}:
			return true
		case <-ctx.Done():
			return false
		}
	}

	readContentBuffered := func(key string, state *objectState, limit int) []string {
		var rc io.ReadCloser
		var err error

		if state.offset > 0 {
			rc, err = store.GetObjectRange(ctx, key, state.offset)
		} else {
			rc, err = store.GetObject(ctx, key)
		}
		if err != nil {
			return nil
		}
		defer rc.Close()

		var reader io.Reader = rc
		if isGzip(key) {
			gz, gzErr := gzip.NewReader(rc)
			if gzErr != nil {
				return nil
			}
			defer gz.Close()
			reader = gz
		}

		scanner := bufio.NewScanner(reader)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		bytesRead := state.offset

		var lines []string
		for scanner.Scan() {
			line := scanner.Text()
			bytesRead += int64(len(scanner.Bytes())) + 1
			lines = append(lines, line)
			if limit > 0 && len(lines) >= limit {
				break
			}
		}

		if !isGzip(key) {
			state.offset = bytesRead
		}

		return lines
	}

	readAndStream := func(key string, state *objectState) {
		var rc io.ReadCloser
		var err error

		if state.offset > 0 {
			rc, err = store.GetObjectRange(ctx, key, state.offset)
		} else {
			rc, err = store.GetObject(ctx, key)
		}
		if err != nil {
			return
		}
		defer rc.Close()

		var reader io.Reader = rc
		if isGzip(key) {
			gz, gzErr := gzip.NewReader(rc)
			if gzErr != nil {
				return
			}
			defer gz.Close()
			reader = gz
		}

		scanner := bufio.NewScanner(reader)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		bytesRead := state.offset

		for scanner.Scan() {
			line := scanner.Text()
			bytesRead += int64(len(scanner.Bytes())) + 1

			select {
			case ch <- provider.LogEntry{
				Timestamp: time.Now(),
				Source:    source,
				Instance:  instance,
				Line:      line,
				Raw:       []byte(line),
			}:
			case <-ctx.Done():
				return
			}
		}

		if !isGzip(key) {
			state.offset = bytesRead
		}
	}

	hasMode := opts.Head > 0 || opts.Tail > 0 || opts.SkipInitial

	if hasMode {
		objects, err := ListAndFilter(ctx, store, cfg)
		if err != nil {
			objects = nil
		}

		if opts.SkipInitial {
			for _, obj := range objects {
				tracked[obj.Key] = &objectState{
					size:         obj.Size,
					lastModified: obj.LastModified,
					offset:       obj.Size,
				}
			}
		} else {
			var allLines []string
			for _, obj := range objects {
				state := &objectState{}
				tracked[obj.Key] = state
				limit := 0
				if opts.Head > 0 {
					limit = opts.Head - len(allLines)
					if limit <= 0 {
						state.size = obj.Size
						state.lastModified = obj.LastModified
						continue
					}
				}
				lines := readContentBuffered(obj.Key, state, limit)
				allLines = append(allLines, lines...)
				state.size = obj.Size
				state.lastModified = obj.LastModified
			}

			if opts.Tail > 0 && len(allLines) > opts.Tail {
				allLines = allLines[len(allLines)-opts.Tail:]
			}

			for _, line := range allLines {
				if !sendEntry(line) {
					return
				}
			}
		}

		if opts.Head > 0 {
			return
		}
	} else {
		objects, err := ListAndFilter(ctx, store, cfg)
		if err != nil {
			objects = nil
		}

		for _, obj := range objects {
			state := &objectState{}
			tracked[obj.Key] = state
			readAndStream(obj.Key, state)
			state.size = obj.Size
			state.lastModified = obj.LastModified
		}
	}

	if !opts.Follow {
		return
	}

	ticker := time.NewTicker(cfg.PollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			objects, err := ListAndFilter(ctx, store, cfg)
			if err != nil {
				continue
			}

			for _, obj := range objects {
				state, exists := tracked[obj.Key]
				if !exists {
					state = &objectState{}
					tracked[obj.Key] = state
					readAndStream(obj.Key, state)
					state.size = obj.Size
					state.lastModified = obj.LastModified
					continue
				}

				if obj.Size > state.size || obj.LastModified.After(state.lastModified) {
					readAndStream(obj.Key, state)
					state.size = obj.Size
					state.lastModified = obj.LastModified
				}
			}
		}
	}
}

// StreamSingleObject streams one specific storage object on the channel, optionally following for new data.
func StreamSingleObject(ctx context.Context, store ObjectStore, key string, source string, opts provider.StreamOpts, pollInterval time.Duration, ch chan<- provider.LogEntry) {
	instance := filepath.Base(key)
	var offset int64

	sendEntry := func(line string) bool {
		select {
		case ch <- provider.LogEntry{
			Timestamp: time.Now(),
			Source:    source,
			Instance:  instance,
			Line:      line,
			Raw:       []byte(line),
		}:
			return true
		case <-ctx.Done():
			return false
		}
	}

	readAndStream := func() {
		var rc io.ReadCloser
		var err error
		if offset > 0 {
			rc, err = store.GetObjectRange(ctx, key, offset)
		} else {
			rc, err = store.GetObject(ctx, key)
		}
		if err != nil {
			return
		}
		defer rc.Close()

		var reader io.Reader = rc
		if isGzip(key) {
			gz, gzErr := gzip.NewReader(rc)
			if gzErr != nil {
				return
			}
			defer gz.Close()
			reader = gz
		}

		scanner := bufio.NewScanner(reader)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		bytesRead := offset

		for scanner.Scan() {
			bytesRead += int64(len(scanner.Bytes())) + 1
			if !sendEntry(scanner.Text()) {
				return
			}
		}

		if !isGzip(key) {
			offset = bytesRead
		}
	}

	readBuffered := func() []string {
		rc, err := store.GetObject(ctx, key)
		if err != nil {
			return nil
		}
		defer rc.Close()

		var reader io.Reader = rc
		if isGzip(key) {
			gz, gzErr := gzip.NewReader(rc)
			if gzErr != nil {
				return nil
			}
			defer gz.Close()
			reader = gz
		}

		scanner := bufio.NewScanner(reader)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		bytesRead := int64(0)

		var lines []string
		for scanner.Scan() {
			bytesRead += int64(len(scanner.Bytes())) + 1
			lines = append(lines, scanner.Text())
		}

		if !isGzip(key) {
			offset = bytesRead
		}
		return lines
	}

	if opts.SkipInitial {
		objects, err := store.ListObjects(ctx, key)
		if err == nil {
			for _, obj := range objects {
				if obj.Key == key {
					offset = obj.Size
					break
				}
			}
		}
	} else if opts.Head > 0 || opts.Tail > 0 {
		lines := readBuffered()
		if opts.Head > 0 {
			if opts.Head < len(lines) {
				lines = lines[:opts.Head]
			}
			for _, line := range lines {
				if !sendEntry(line) {
					return
				}
			}
			return
		}
		if opts.Tail > 0 && len(lines) > opts.Tail {
			lines = lines[len(lines)-opts.Tail:]
		}
		for _, line := range lines {
			if !sendEntry(line) {
				return
			}
		}
	} else {
		readAndStream()
	}

	if !opts.Follow {
		return
	}

	if pollInterval < 5*time.Second {
		pollInterval = 5 * time.Second
	}

	var lastSize int64
	objects, err := store.ListObjects(ctx, key)
	if err == nil {
		for _, obj := range objects {
			if obj.Key == key {
				lastSize = obj.Size
				break
			}
		}
	}

	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			objects, err := store.ListObjects(ctx, key)
			if err != nil {
				continue
			}
			for _, obj := range objects {
				if obj.Key == key {
					if obj.Size > lastSize {
						readAndStream()
						lastSize = obj.Size
					}
					break
				}
			}
		}
	}
}

func isGzip(key string) bool {
	return strings.HasSuffix(strings.ToLower(key), ".gz")
}
