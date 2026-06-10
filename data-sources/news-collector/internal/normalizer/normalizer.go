package normalizer

import (
	"context"
	"strings"
	"time"

	"github.com/MythreshMukkara/new-collector/internal/domain"
	"github.com/MythreshMukkara/new-collector/internal/hashing"
	"github.com/google/uuid"
)

type Normalizer struct{}

func New() *Normalizer {
	return &Normalizer{}
}

// Normalize converts a RawItem to a canonical domain.Article, generating hashes and structuring metadata.
func (n *Normalizer) Normalize(ctx context.Context, item *domain.RawItem) (*domain.Article, error) {
	id := uuid.New().String()
	collectedAt := time.Now().UTC().Format(time.RFC3339)

	publishedTime := parsePublishedTime(item.PublishedAt)
	publishedAt := publishedTime.UTC().Format(time.RFC3339)

	// Clean fields
	title := strings.TrimSpace(item.Title)
	summary := strings.TrimSpace(item.Summary)
	content := strings.TrimSpace(item.Content)
	urlStr := strings.TrimSpace(item.URL)

	// Clean authors, categories
	authors := cleanSlice(item.Authors)
	categories := cleanSlice(item.Categories)

	// Create article struct skeleton
	article := &domain.Article{
		ID:              id,
		Source:          item.Source,
		Title:           title,
		Summary:         summary,
		Content:         content,
		URL:             urlStr,
		Authors:         authors,
		Categories:      categories,
		PublishedAt:     publishedAt,
		CollectedAt:     collectedAt,
		ImageURLs:       cleanSlice(item.ImageURLs),
		FingerprintHash: "", // populated below
		IntegrityHash:   "", // populated below
		Metadata:        make(map[string]any),
	}

	// Generate deterministic Fingerprint Hash (publisher + title + canonical_url)
	// The fingerprint is crucial for duplicate checking downstream
	fingerprint := hashing.GenerateFingerprint(item.Source.Publisher, title, urlStr)
	article.FingerprintHash = fingerprint

	// Generate content Integrity Hash
	integrity, err := hashing.GenerateIntegrity(article)
	if err != nil {
		return nil, err
	}
	article.IntegrityHash = integrity

	// Populate metadata with payload info
	article.Metadata["collector_version"] = "1.0.0"

	// Include snippet of raw payload for provenance tracking
	rawLen := len(item.RawPayload)
	if rawLen > 1000 {
		article.Metadata["raw_payload_snippet"] = item.RawPayload[:1000] + "... [truncated]"
	} else {
		article.Metadata["raw_payload_snippet"] = item.RawPayload
	}

	return article, nil
}

// parsePublishedTime parses various date/time formats common in feeds into time.Time.
func parsePublishedTime(raw string) time.Time {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Now()
	}

	layouts := []string{
		time.RFC3339,
		time.RFC1123Z,
		time.RFC1123,
		time.RFC822Z,
		time.RFC822,
		"2006-01-02 15:04:05",
		"2006-01-02T15:04:05",
		"Mon, 02 Jan 2006 15:04:05 MST",
		"02 Jan 2006 15:04:05 MST",
		"January 2, 2006 15:04:05 MST",
	}

	for _, layout := range layouts {
		if t, err := time.Parse(layout, raw); err == nil {
			return t
		}
	}

	return time.Now() // default fallback
}

// cleanSlice removes empty strings and trims whitespace from a slice of strings.
func cleanSlice(in []string) []string {
	out := make([]string, 0, len(in))
	seen := make(map[string]bool)
	for _, s := range in {
		trimmed := strings.TrimSpace(s)
		if trimmed != "" && !seen[trimmed] {
			seen[trimmed] = true
			out = append(out, trimmed)
		}
	}
	return out
}
