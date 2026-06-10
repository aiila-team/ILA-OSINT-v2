package hashing

import (
	"testing"

	"github.com/MythreshMukkara/new-collector/internal/domain"
)

func TestGenerateFingerprint(t *testing.T) {
	publisher := "TOI"
	title := "Breaking News: Go 1.26 Released!"
	urlVal := "https://timesofindia.indiatimes.com/news/go-release/?utm_source=feed&ref=123"

	fp1 := GenerateFingerprint(publisher, title, urlVal)

	// Slightly different case/spacing in publisher and title, different UTM and tracking params in URL
	publisher2 := " toi "
	title2 := "breaking news: go 1.26 released! "
	urlVal2 := "HTTPS://timesofindia.indiatimes.com/news/go-release?utm_medium=email&fbclid=xyz"

	fp2 := GenerateFingerprint(publisher2, title2, urlVal2)

	if fp1 != fp2 {
		t.Errorf("expected fingerprint to be stable, but got different hashes: %s vs %s", fp1, fp2)
	}
}

func TestGenerateIntegrity(t *testing.T) {
	art := &domain.Article{
		ID:              "123",
		Title:           "Test",
		URL:             "https://example.com",
		FingerprintHash: "old-fingerprint-value-should-be-cleared-before-integrity-hashing",
		IntegrityHash:   "old-integrity-value-should-be-cleared-before-integrity-hashing",
	}

	hash1, err := GenerateIntegrity(art)
	if err != nil {
		t.Fatalf("unexpected integrity hashing error: %v", err)
	}

	art.FingerprintHash = "another-value"
	art.IntegrityHash = "yet-another-value"
	hash2, err := GenerateIntegrity(art)
	if err != nil {
		t.Fatalf("unexpected integrity hashing error: %v", err)
	}

	if hash1 != hash2 {
		t.Errorf("integrity hash should not depend on existing hash fields, got %s and %s", hash1, hash2)
	}
}
