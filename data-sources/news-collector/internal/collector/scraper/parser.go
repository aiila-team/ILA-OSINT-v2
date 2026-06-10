package scraper

import (
	"net/url"
	"strings"
)

// ResolveURL handles relative URLs by resolving them against the base URL.
func ResolveURL(baseURI, href string) string {
	uri, err := url.Parse(href)
	if err != nil {
		return href
	}
	base, err := url.Parse(baseURI)
	if err != nil {
		return href
	}
	return base.ResolveReference(uri).String()
}

// IsEenaduArticle checks if a URL is likely an Eenadu article page.
func IsEenaduArticle(link string) bool {
	parsed, err := url.Parse(link)
	if err != nil {
		return false
	}
	// Check domain
	if !strings.Contains(parsed.Host, "eenadu.net") {
		return false
	}
	path := parsed.Path
	if strings.HasSuffix(path, ".html") {
		return true
	}
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) >= 3 {
		lastPart := parts[len(parts)-1]
		if isNumeric(lastPart) {
			return true
		}
	}
	return false
}

func isNumeric(s string) bool {
	if len(s) == 0 {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// IsTV9Article checks if a URL is likely a TV9 Telugu article page.
func IsTV9Article(link string) bool {
	parsed, err := url.Parse(link)
	if err != nil {
		return false
	}
	if !strings.Contains(parsed.Host, "tv9telugu.com") {
		return false
	}
	path := parsed.Path
	if !strings.HasSuffix(path, ".html") {
		return false
	}
	parts := strings.Split(strings.Trim(path, "/"), "/")
	return len(parts) >= 2
}
