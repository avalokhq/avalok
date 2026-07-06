package filebrowser

import (
	"archive/tar"
	"archive/zip"
	"compress/bzip2"
	"compress/gzip"
	"fmt"
	"io"
	"os"
)

func DecompressReader(f io.Reader, compression string) (io.ReadCloser, error) {
	switch compression {
	case "gz", "tar.gz":
		gr, err := gzip.NewReader(f)
		if err != nil {
			return nil, fmt.Errorf("gzip: %w", err)
		}
		if compression == "tar.gz" {
			return extractFirstTarEntry(gr)
		}
		return gr, nil

	case "bz2", "tar.bz2":
		br := bzip2.NewReader(f)
		if compression == "tar.bz2" {
			return extractFirstTarEntry(io.NopCloser(br))
		}
		return io.NopCloser(br), nil

	default:
		return nil, fmt.Errorf("unsupported compression: %s", compression)
	}
}

func DecompressZip(path string) (io.ReadCloser, error) {
	zr, err := zip.OpenReader(path)
	if err != nil {
		return nil, fmt.Errorf("zip: %w", err)
	}

	if len(zr.File) == 0 {
		zr.Close()
		return nil, fmt.Errorf("zip: archive is empty")
	}

	f, err := zr.File[0].Open()
	if err != nil {
		zr.Close()
		return nil, fmt.Errorf("zip: opening first entry: %w", err)
	}

	return &zipReadCloser{reader: f, archive: zr}, nil
}

type zipReadCloser struct {
	reader  io.ReadCloser
	archive *zip.ReadCloser
}

func (z *zipReadCloser) Read(p []byte) (int, error) {
	return z.reader.Read(p)
}

func (z *zipReadCloser) Close() error {
	z.reader.Close()
	return z.archive.Close()
}

func extractFirstTarEntry(r io.ReadCloser) (io.ReadCloser, error) {
	tr := tar.NewReader(r)

	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			r.Close()
			return nil, fmt.Errorf("tar: no files in archive")
		}
		if err != nil {
			r.Close()
			return nil, fmt.Errorf("tar: %w", err)
		}
		if hdr.Typeflag == tar.TypeReg {
			return &tarReadCloser{reader: tr, closer: r}, nil
		}
	}
}

type tarReadCloser struct {
	reader io.Reader
	closer io.Closer
}

func (t *tarReadCloser) Read(p []byte) (int, error) {
	return t.reader.Read(p)
}

func (t *tarReadCloser) Close() error {
	return t.closer.Close()
}

func DecompressToTemp(srcPath, compression string) (string, error) {
	var reader io.ReadCloser
	var err error

	if compression == "zip" {
		reader, err = DecompressZip(srcPath)
	} else {
		f, ferr := os.Open(srcPath)
		if ferr != nil {
			return "", ferr
		}
		reader, err = DecompressReader(f, compression)
		if err != nil {
			f.Close()
			return "", err
		}
	}
	if err != nil {
		return "", err
	}
	defer reader.Close()

	tmp, err := os.CreateTemp("", "avalok-filebrowser-*.log")
	if err != nil {
		return "", fmt.Errorf("creating temp file: %w", err)
	}

	const maxDecompressedSize = 100 << 20 // 100 MB
	limited := io.LimitReader(reader, maxDecompressedSize+1)
	n, err := io.Copy(tmp, limited)
	if err != nil {
		tmp.Close()
		os.Remove(tmp.Name())
		return "", fmt.Errorf("decompressing: %w", err)
	}
	if n > maxDecompressedSize {
		tmp.Close()
		os.Remove(tmp.Name())
		return "", fmt.Errorf("decompressed file exceeds %d MB limit", maxDecompressedSize>>20)
	}

	tmp.Close()
	return tmp.Name(), nil
}
