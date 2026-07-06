package filebrowser

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

type LocalBrowser struct {
	dir     string
	tmpMgr  *TempManager
}

func NewLocalBrowser(dir string, tmpMgr *TempManager) *LocalBrowser {
	return &LocalBrowser{dir: dir, tmpMgr: tmpMgr}
}

func (b *LocalBrowser) ListFiles(_ context.Context) ([]FileInfo, error) {
	entries, err := os.ReadDir(b.dir)
	if err != nil {
		return nil, fmt.Errorf("reading directory %s: %w", b.dir, err)
	}

	var files []FileInfo
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		compressed, compression := DetectCompression(e.Name())
		files = append(files, FileInfo{
			Name:         e.Name(),
			Size:         info.Size(),
			ModTime:      info.ModTime(),
			IsCompressed: compressed,
			Compression:  compression,
		})
	}

	sort.Slice(files, func(i, j int) bool {
		return files[i].ModTime.After(files[j].ModTime)
	})

	return files, nil
}

func (b *LocalBrowser) ReadPage(_ context.Context, filename string, req PageRequest) (*PageResponse, error) {
	if !ValidateFilename(filename) {
		return nil, fmt.Errorf("invalid filename")
	}

	fullPath := filepath.Join(b.dir, filename)
	info, err := os.Stat(fullPath)
	if err != nil {
		return nil, fmt.Errorf("file not found: %s", filename)
	}

	compressed, compression := DetectCompression(filename)

	readPath := fullPath
	warning := ""
	if compressed {
		tmpPath, err := b.tmpMgr.GetOrCreate(fullPath, func() (string, error) {
			return DecompressToTemp(fullPath, compression)
		})
		if err != nil {
			return nil, fmt.Errorf("decompressing %s: %w", filename, err)
		}
		readPath = tmpPath
		warning = "This file was decompressed from a temporary copy. The temporary file will be cleaned up automatically."
	}

	pageSize := req.PageSize
	if pageSize <= 0 {
		pageSize = DefaultPageSize
	}
	page := req.Page
	if page <= 0 {
		page = 1
	}

	totalLines, err := countLines(readPath)
	if err != nil {
		return nil, fmt.Errorf("counting lines: %w", err)
	}

	totalPages := (totalLines + pageSize - 1) / pageSize
	if totalPages == 0 {
		totalPages = 1
	}

	startLine := (page - 1) * pageSize
	lines, err := readLines(readPath, startLine, pageSize)
	if err != nil {
		return nil, fmt.Errorf("reading lines: %w", err)
	}

	return &PageResponse{
		Lines:      lines,
		Page:       page,
		PageSize:   pageSize,
		TotalLines: totalLines,
		TotalPages: totalPages,
		HasMore:    page < totalPages,
		FileSize:   info.Size(),
		FileName:   filename,
		Warning:    warning,
	}, nil
}

func (b *LocalBrowser) Search(_ context.Context, req SearchRequest) ([]SearchResult, error) {
	maxHits := req.MaxHits
	if maxHits <= 0 {
		maxHits = 500
	}

	files, err := b.ListFiles(context.Background())
	if err != nil {
		return nil, err
	}

	targetFiles := files
	if len(req.Files) > 0 {
		allowed := make(map[string]bool)
		for _, f := range req.Files {
			allowed[f] = true
		}
		targetFiles = nil
		for _, f := range files {
			if allowed[f.Name] {
				targetFiles = append(targetFiles, f)
			}
		}
	}

	var matcher func(string) bool
	if req.UseRegex {
		re, err := regexp.Compile(req.Pattern)
		if err != nil {
			return nil, fmt.Errorf("invalid regex: %w", err)
		}
		matcher = re.MatchString
	} else {
		lower := strings.ToLower(req.Pattern)
		matcher = func(s string) bool {
			return strings.Contains(strings.ToLower(s), lower)
		}
	}

	var results []SearchResult
	for _, fi := range targetFiles {
		if len(results) >= maxHits {
			break
		}

		readPath := filepath.Join(b.dir, fi.Name)
		if fi.IsCompressed {
			tmpPath, err := b.tmpMgr.GetOrCreate(readPath, func() (string, error) {
				return DecompressToTemp(readPath, fi.Compression)
			})
			if err != nil {
				continue
			}
			readPath = tmpPath
		}

		hits, err := searchFile(readPath, fi.Name, matcher, maxHits-len(results))
		if err != nil {
			continue
		}
		results = append(results, hits...)
	}

	return results, nil
}

func (b *LocalBrowser) Close() error {
	return nil
}

func countLines(path string) (int, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, err
	}
	defer f.Close()

	count := 0
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
	for scanner.Scan() {
		count++
	}
	return count, scanner.Err()
}

func readLines(path string, skip, limit int) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var lines []string
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
	lineNum := 0
	for scanner.Scan() {
		if lineNum >= skip {
			lines = append(lines, scanner.Text())
			if len(lines) >= limit {
				break
			}
		}
		lineNum++
	}

	return lines, scanner.Err()
}

func searchFile(path, displayName string, matcher func(string) bool, limit int) ([]SearchResult, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var results []SearchResult
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
	lineNum := 0
	for scanner.Scan() {
		lineNum++
		line := scanner.Text()
		if matcher(line) {
			results = append(results, SearchResult{
				File:    displayName,
				Line:    lineNum,
				Content: line,
			})
			if len(results) >= limit {
				break
			}
		}
	}
	return results, scanner.Err()
}
