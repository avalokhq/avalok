package filebrowser

import (
	"context"
	"path/filepath"
	"strings"
	"time"
)

type FileInfo struct {
	Name         string    `json:"name"`
	Size         int64     `json:"size"`
	ModTime      time.Time `json:"mod_time"`
	IsCompressed bool      `json:"is_compressed"`
	Compression  string    `json:"compression,omitempty"`
}

type PageRequest struct {
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
}

type PageResponse struct {
	Lines      []string `json:"lines"`
	Page       int      `json:"page"`
	PageSize   int      `json:"page_size"`
	TotalLines int      `json:"total_lines"`
	TotalPages int      `json:"total_pages"`
	HasMore    bool     `json:"has_more"`
	FileSize   int64    `json:"file_size"`
	FileName   string   `json:"file_name"`
	Warning    string   `json:"warning,omitempty"`
}

type SearchRequest struct {
	Pattern  string   `json:"pattern"`
	Files    []string `json:"files"`
	MaxHits  int      `json:"max_hits"`
	UseRegex bool     `json:"use_regex"`
}

type SearchResult struct {
	File    string `json:"file"`
	Line    int    `json:"line"`
	Content string `json:"content"`
}

type Browser interface {
	ListFiles(ctx context.Context) ([]FileInfo, error)
	ReadPage(ctx context.Context, filename string, req PageRequest) (*PageResponse, error)
	Search(ctx context.Context, req SearchRequest) ([]SearchResult, error)
	Close() error
}

const DefaultPageSize = 10000

var compressedExtensions = map[string]string{
	".gz":  "gz",
	".bz2": "bz2",
	".xz":  "xz",
	".zip": "zip",
}

func DetectCompression(name string) (bool, string) {
	ext := strings.ToLower(filepath.Ext(name))

	base := strings.TrimSuffix(name, ext)
	if strings.ToLower(filepath.Ext(base)) == ".tar" {
		return true, "tar" + ext
	}

	if comp, ok := compressedExtensions[ext]; ok {
		return true, comp
	}
	return false, ""
}

func ValidateFilename(name string) bool {
	if name == "" {
		return false
	}
	if strings.Contains(name, "..") {
		return false
	}
	if strings.ContainsAny(name, "/\\") {
		return false
	}
	if filepath.IsAbs(name) {
		return false
	}
	return true
}
