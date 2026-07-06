package shellutil

import "strings"

// Quote wraps a value in POSIX single quotes, escaping any embedded
// single quotes. The result is safe to interpolate into a shell command
// string without risk of injection.
//
//	ShellQuote("hello world")       => 'hello world'
//	ShellQuote("it's dangerous")    => 'it'"'"'s dangerous'
//	ShellQuote("/var/log/x; rm -rf /") => '/var/log/x; rm -rf /'
func Quote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'"'"'`) + "'"
}
