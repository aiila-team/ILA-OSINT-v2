package normalizer

import (
	"context"
	"testing"
	"time"

	"github.com/MythreshMukkara/new-collector/internal/domain"
)

func TestNormalizer_Normalize(t *testing.T) {
	norm := New()

	raw := &domain.RawItem{
		Source: domain.ArticleSource{
			Publisher:  "BBC",
			FeedName:   "World",
			FeedURL:    "https://example.com/rss",
			SourceType: "rss",
			Country:    "UK",
			Language:   "en",
		},
		Title:       "   Example Title   ",
		Summary:     "A quick summary.",
		Content:     "Full details on the news.",
		URL:         "https://example.com/article/1",
		Authors:     []string{" John Doe ", "Jane Smith", "John Doe"}, // duplicates & spacing
		Categories:  []string{"Tech", " Tech ", "Science"},
		PublishedAt: "Mon, 02 Jan 2006 15:04:05 MST", // RFC1123 format
		ImageURLs:   []string{"https://example.com/img.png"},
		RawPayload:  "<xml><title>Example Title</title></xml>",
	}

	art, err := norm.Normalize(context.Background(), raw)
	if err != nil {
		t.Fatalf("Normalize returned unexpected error: %v", err)
	}

	// 1. Verify UUID assignment
	if art.ID == "" {
		t.Error("expected Article ID to be assigned as a UUID, got empty")
	}

	// 2. Verify cleaning & trim
	if art.Title != "Example Title" {
		t.Errorf("expected Title to be trimmed, got: %q", art.Title)
	}

	// 3. Verify slice cleaning (deduplication & trim)
	if len(art.Authors) != 2 || art.Authors[0] != "John Doe" || art.Authors[1] != "Jane Smith" {
		t.Errorf("expected clean and unique authors list, got: %v", art.Authors)
	}

	if len(art.Categories) != 2 || art.Categories[0] != "Tech" || art.Categories[1] != "Science" {
		t.Errorf("expected clean unique categories list, got: %v", art.Categories)
	}

	// 4. Verify date normalization to ISO8601 (RFC3339)
	parsedPub, err := time.Parse(time.RFC3339, art.PublishedAt)
	if err != nil {
		t.Errorf("expected PublishedAt to be RFC3339 formatted, got error parsing: %v", err)
	}
	expectedPub := time.Date(2006, 1, 2, 15, 4, 5, 0, time.UTC)
	if !parsedPub.Equal(expectedPub) {
		t.Errorf("expected PublishedAt to equal %v, got %v", expectedPub, parsedPub)
	}

	// 5. Verify CollectedAt is filled
	if _, err := time.Parse(time.RFC3339, art.CollectedAt); err != nil {
		t.Errorf("expected CollectedAt to be RFC3339 formatted, got error parsing: %v", err)
	}

	// 6. Verify Hashing Assignments
	if art.FingerprintHash == "" {
		t.Error("expected fingerprint hash to be assigned, got empty")
	}

	if art.IntegrityHash == "" {
		t.Error("expected integrity hash to be assigned, got empty")
	}
}
