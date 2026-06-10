package hashing

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/url"
	"strings"

	"github.com/MythreshMukkara/new-collector/internal/domain"
)

// GenerateFingerprint calculates the SHA-256 fingerprint of publisher + title + canonical_url.
// It normalizes inputs for stability.
func GenerateFingerprint(publisher, title, canonicalURL string) string {
	cleanPublisher := strings.ToLower(strings.TrimSpace(publisher))
	cleanTitle := strings.ToLower(strings.TrimSpace(title))
	cleanURL := CleanAndNormalizeURL(canonicalURL)

	input := cleanPublisher + "|" + cleanTitle + "|" + cleanURL
	hash := sha256.Sum256([]byte(input))
	return hex.EncodeToString(hash[:])
}

// GenerateIntegrity calculates SHA-256 of the entire canonical struct JSON representation (excluding the Hash fields).
func GenerateIntegrity(article *domain.Article) (string, error) {
	// Copy article to avoid modifying the original
	temp := *article
	temp.FingerprintHash = "" // Zero out hash to make it idempotent
	temp.IntegrityHash = ""   // Zero out hash to make it idempotent

	data, err := json.Marshal(temp)
	if err != nil {
		return "", err
	}

	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:]), nil
}

// CleanAndNormalizeURL standardizes a URL by stripping common tracking parameters and lowercasing the scheme and host.
func CleanAndNormalizeURL(rawURL string) string {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return strings.ToLower(rawURL) // Fallback to lowercase
	}

	// Normalize scheme and host
	parsed.Scheme = strings.ToLower(parsed.Scheme)
	parsed.Host = strings.ToLower(parsed.Host)

	// Strip query parameters that are tracking variables
	q := parsed.Query()
	for key := range q {
		if strings.HasPrefix(key, "utm_") || key == "fbclid" || key == "gclid" || key == "ref" {
			q.Del(key)
		}
	}
	parsed.RawQuery = q.Encode()

	// Strip trailing slash from path
	parsed.Path = strings.TrimSuffix(parsed.Path, "/")

	return parsed.String()
}
