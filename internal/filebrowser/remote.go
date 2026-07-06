package filebrowser

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"
)

type RemoteRunner interface {
	Run(ctx context.Context, command string) ([]byte, error)
	Stream(ctx context.Context, command string) (stdout io.Reader, stderr io.Reader, cleanup func(), err error)
}

type RemoteBrowser struct {
	dir    string
	runner RemoteRunner
	sudo   bool
}

func NewRemoteBrowser(dir string, runner RemoteRunner, sudo bool) *RemoteBrowser {
	return &RemoteBrowser{dir: dir, runner: runner, sudo: sudo}
}

func (b *RemoteBrowser) ListFiles(ctx context.Context) ([]FileInfo, error) {
	cmd := fmt.Sprintf("ls -la --time-style=full-iso %s 2>/dev/null", shellEscape(b.dir))
	if b.sudo {
		cmd = "sudo " + cmd
	}

	output, err := b.runner.Run(ctx, cmd)
	if err != nil {
		return nil, fmt.Errorf("listing remote directory: %w", err)
	}

	return parseLsOutput(bytes.NewReader(output))
}

func (b *RemoteBrowser) ReadPage(ctx context.Context, filename string, req PageRequest) (*PageResponse, error) {
	if !ValidateFilename(filename) {
		return nil, fmt.Errorf("invalid filename")
	}

	fullPath := b.dir + "/" + filename
	compressed, compression := DetectCompression(filename)

	pageSize := req.PageSize
	if pageSize <= 0 {
		pageSize = DefaultPageSize
	}
	page := req.Page
	if page <= 0 {
		page = 1
	}

	sizeCmd := fmt.Sprintf("stat -c '%%s' %s 2>/dev/null", shellEscape(fullPath))
	if b.sudo {
		sizeCmd = "sudo " + sizeCmd
	}
	sizeOut, err := b.runner.Run(ctx, sizeCmd)
	if err != nil {
		return nil, fmt.Errorf("file not found: %s", filename)
	}
	fileSize, _ := strconv.ParseInt(strings.TrimSpace(string(sizeOut)), 10, 64)

	var catCmd string
	if compressed {
		catCmd = remoteDecompressCommand(compression, fullPath)
	} else {
		catCmd = fmt.Sprintf("cat %s", shellEscape(fullPath))
	}
	if b.sudo {
		catCmd = "sudo " + catCmd
	}

	countCmd := fmt.Sprintf("%s | wc -l", catCmd)
	countOut, err := b.runner.Run(ctx, countCmd)
	if err != nil {
		return nil, fmt.Errorf("counting lines: %w", err)
	}
	totalLines, _ := strconv.Atoi(strings.TrimSpace(string(countOut)))

	totalPages := (totalLines + pageSize - 1) / pageSize
	if totalPages == 0 {
		totalPages = 1
	}

	startLine := (page-1)*pageSize + 1
	readCmd := fmt.Sprintf("%s | tail -n +%d | head -n %d", catCmd, startLine, pageSize)

	data, err := b.runner.Run(ctx, readCmd)
	if err != nil {
		return nil, fmt.Errorf("reading page: %w", err)
	}

	var lines []string
	scanner := bufio.NewScanner(bytes.NewReader(data))
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}

	warning := ""
	if compressed {
		warning = "This file was decompressed on the remote host for viewing. No temporary files were created."
	}

	return &PageResponse{
		Lines:      lines,
		Page:       page,
		PageSize:   pageSize,
		TotalLines: totalLines,
		TotalPages: totalPages,
		HasMore:    page < totalPages,
		FileSize:   fileSize,
		FileName:   filename,
		Warning:    warning,
	}, nil
}

func (b *RemoteBrowser) Search(ctx context.Context, req SearchRequest) ([]SearchResult, error) {
	maxHits := req.MaxHits
	if maxHits <= 0 {
		maxHits = 500
	}

	files, err := b.ListFiles(ctx)
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

	var results []SearchResult
	for _, fi := range targetFiles {
		if len(results) >= maxHits {
			break
		}

		remaining := maxHits - len(results)
		fullPath := b.dir + "/" + fi.Name

		var grepCmd string
		if fi.IsCompressed {
			catCmd := remoteDecompressCommand(fi.Compression, fullPath)
			if b.sudo {
				catCmd = "sudo " + catCmd
			}
			grepFlag := "-in"
			if req.UseRegex {
				grepFlag = "-inE"
			}
			grepCmd = fmt.Sprintf("%s | grep %s -m %d %s", catCmd, grepFlag, remaining, shellEscape(req.Pattern))
		} else {
			grepFlag := "-in"
			if req.UseRegex {
				grepFlag = "-inE"
			}
			grepCmd = fmt.Sprintf("grep %s -m %d %s %s", grepFlag, remaining, shellEscape(req.Pattern), shellEscape(fullPath))
			if b.sudo {
				grepCmd = "sudo " + grepCmd
			}
		}

		data, err := b.runner.Run(ctx, grepCmd)
		if err != nil {
			continue
		}

		scanner := bufio.NewScanner(bytes.NewReader(data))
		for scanner.Scan() {
			line := scanner.Text()
			lineNum := 0
			content := line

			if idx := strings.Index(line, ":"); idx > 0 {
				if n, err := strconv.Atoi(line[:idx]); err == nil {
					lineNum = n
					content = line[idx+1:]
				}
			}

			results = append(results, SearchResult{
				File:    fi.Name,
				Line:    lineNum,
				Content: content,
			})
			if len(results) >= maxHits {
				break
			}
		}
	}

	return results, nil
}

func (b *RemoteBrowser) Close() error {
	return nil
}

func remoteDecompressCommand(compression, path string) string {
	escaped := shellEscape(path)
	switch compression {
	case "gz", "tar.gz":
		return "zcat " + escaped
	case "bz2", "tar.bz2":
		return "bzcat " + escaped
	case "xz":
		return "xzcat " + escaped
	case "zip":
		return "unzip -p " + escaped
	default:
		return "cat " + escaped
	}
}

func shellEscape(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\"'\"'") + "'"
}

func parseLsOutput(r io.Reader) ([]FileInfo, error) {
	var files []FileInfo
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		line := scanner.Text()
		if len(line) == 0 || line[0] == 't' {
			continue
		}
		if line[0] == 'd' {
			continue
		}
		fi := parseLsLine(line)
		if fi != nil {
			files = append(files, *fi)
		}
	}
	return files, scanner.Err()
}

func parseLsLine(line string) *FileInfo {
	fields := strings.Fields(line)
	if len(fields) < 9 {
		return nil
	}

	size, err := strconv.ParseInt(fields[4], 10, 64)
	if err != nil {
		return nil
	}

	dateStr := fields[5] + " " + fields[6]
	modTime, err := time.Parse("2006-01-02 15:04:05.000000000", dateStr)
	if err != nil {
		modTime = time.Time{}
	}

	name := strings.Join(fields[8:], " ")
	compressed, compression := DetectCompression(name)

	return &FileInfo{
		Name:         name,
		Size:         size,
		ModTime:      modTime,
		IsCompressed: compressed,
		Compression:  compression,
	}
}
