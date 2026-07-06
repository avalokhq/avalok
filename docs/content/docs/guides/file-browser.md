---
weight: 550
title: "File Browser"
description: "Browse, read, search, and download remote log files through the web UI."
icon: "folder_open"
---

# File Browser

The File Browser provides read-only access to log files on remote hosts through the Avalok web UI. You can list files in a log directory, read file contents with pagination, search across files with plain text or regex, and download files -- all without SSH access.

## When to Use the File Browser

- **Browsing archived logs** that aren't actively streamed (rotated log files, compressed archives)
- **Searching across multiple log files** for a specific error or request ID
- **Downloading log files** for offline analysis
- **Reading compressed logs** without manually decompressing them on the remote host

## Prerequisites

The file browser is available for any service that has a `log_dir` configured in its provider config:

```yaml
services:
  - name: app-logs
    provider: file
    config:
      log_dir: /var/log/myapp
      pattern: "*.log"
```

The `log_dir` field tells Avalok where to look for files. The `pattern` field is used by the streaming provider to select which files to tail, but the file browser shows all files in the directory.

## Accessing the File Browser

In the web UI, services with a `log_dir` configuration display a folder icon next to the service name. Click the folder icon to open the file browser for that service.

The file browser opens in a panel showing:

- **File list** -- all files in the `log_dir` directory, sorted by modification time
- **File size** -- human-readable file sizes
- **Modification time** -- when each file was last modified
- **Compression indicator** -- compressed files are marked with their compression type

## Reading Files

Click any file to open it in the reader. Files are loaded with pagination:

- **Default page size:** 10,000 lines per page
- **Page navigation:** move between pages using next/previous controls
- **Total line count:** displayed alongside pagination controls

The page size can be customized:

- Per request via the `page_size` query parameter (max: 100,000)
- Globally via the `file_browser_page_size` admin setting (server mode)

## Compression Support

The file browser transparently decompresses files with these formats:

| Extension | Format |
|---|---|
| `.gz` | gzip |
| `.bz2` | bzip2 |
| `.xz` | xz |
| `.zip` | zip |
| `.tar.gz` | gzip-compressed tar |
| `.tar.bz2` | bzip2-compressed tar |
| `.tar.xz` | xz-compressed tar |

Compressed files are decompressed on-the-fly when reading. You see plain text content in the reader regardless of the file's compression format.

## Searching Files

The file browser includes a search function that finds text across one or more files in the log directory.

### Search Options

| Option | Description |
|---|---|
| **Pattern** | The text or regex pattern to search for |
| **Files** | Optional list of specific files to search (empty = search all) |
| **Use Regex** | Enable regular expression matching |
| **Max Hits** | Maximum number of results to return |

### Search Results

Results include:

- **File name** -- which file the match was found in
- **Line number** -- the line number within the file
- **Content** -- the matching line

Results are capped at 500 matches by default. If the result set is truncated, the response indicates this so you can narrow your search.

## Downloading Files

Click the download button on any file to download it to your local machine. Files are downloaded in their original format (compressed files remain compressed).

## Security

### Filename Validation

The file browser validates all filenames before accessing them. The following are blocked:

- **Path traversal** -- filenames containing `..` are rejected
- **Path separators** -- filenames containing `/` or `\` are rejected
- **Absolute paths** -- filenames that are absolute paths are rejected
- **Empty filenames** -- empty strings are rejected

This prevents directory traversal attacks where a malicious filename like `../../etc/passwd` could access files outside the log directory.

### Access Control

File browser access follows the same RBAC rules as log streaming:

- Users can only browse files for services they have access to (based on their scope)
- In server mode, the admin-configured scope determines which workspaces, environments, and services a user can access
- In serve mode, the `--scope` or `--allow` flags control access

### Read-Only

The file browser is strictly read-only. It cannot create, modify, or delete files on the remote host.

## API Endpoints

The file browser exposes four API endpoints under each service path:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/ws/{name}/env/{env}/svc/{svc}/files` | List files in the log directory |
| `GET` | `/api/ws/{name}/env/{env}/svc/{svc}/files/{filename}` | Read a file with pagination |
| `GET` | `/api/ws/{name}/env/{env}/svc/{svc}/files/{filename}/download` | Download a file |
| `POST` | `/api/ws/{name}/env/{env}/svc/{svc}/files/search` | Search across files |

### List Files Response

```json
{
  "files": [
    {
      "name": "app.log",
      "size": 1048576,
      "mod_time": "2026-07-30T12:00:00Z",
      "is_compressed": false
    },
    {
      "name": "app.log.1.gz",
      "size": 204800,
      "mod_time": "2026-07-29T12:00:00Z",
      "is_compressed": true,
      "compression": "gz"
    }
  ],
  "log_dir": "/var/log/myapp"
}
```

### Read File Response

```json
{
  "lines": ["2026-07-30 12:00:01 INFO Starting...", "..."],
  "page": 1,
  "page_size": 10000,
  "total_lines": 45230,
  "total_pages": 5,
  "has_more": true,
  "file_size": 1048576,
  "file_name": "app.log"
}
```

### Search Request

```json
{
  "pattern": "ERROR",
  "files": ["app.log", "app.log.1.gz"],
  "use_regex": false,
  "max_hits": 100
}
```

### Search Response

```json
{
  "results": [
    {
      "file": "app.log",
      "line": 142,
      "content": "2026-07-30 12:05:33 ERROR Connection refused"
    }
  ],
  "truncated": false
}
```
