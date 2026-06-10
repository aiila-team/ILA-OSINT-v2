package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/MythreshMukkara/new-collector/internal/domain"
)

func TestAPICollector_Collect_NewsAPI_Success(t *testing.T) {
	mockResponse := `{
		"status": "ok",
		"totalResults": 1,
		"articles": [
			{
				"source": {
					"id": "wired",
					"name": "Wired"
				},
				"author": "Steven Levy",
				"title": "The End of AI-Generated Content",
				"description": "A deep dive into why AI-generated content is slowing down.",
				"url": "https://www.wired.com/story/end-of-ai-content",
				"urlToImage": "https://www.wired.com/hero.jpg",
				"publishedAt": "2026-06-09T01:00:00Z",
				"content": "Full content of the article goes here..."
			}
		]
	}`

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(mockResponse))
	}))
	defer ts.Close()

	collector := New(2 * time.Second)
	source := domain.ArticleSource{
		Publisher:  "newsapi",
		SourceType: "api",
		Endpoint:   ts.URL,
		APIKey:     "fake-api-key",
		Country:    "US",
		Language:   "en",
	}

	items, err := collector.Collect(context.Background(), source)
	if err != nil {
		t.Fatalf("unexpected API collection error: %v", err)
	}

	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}

	item := items[0]
	if item.Title != "The End of AI-Generated Content" {
		t.Errorf("expected Title 'The End of AI-Generated Content', got %q", item.Title)
	}
	if item.Summary != "A deep dive into why AI-generated content is slowing down." {
		t.Errorf("expected Summary 'A deep dive into why AI-generated content is slowing down.', got %q", item.Summary)
	}
	if item.Content != "Full content of the article goes here..." {
		t.Errorf("expected Content 'Full content of the article goes here...', got %q", item.Content)
	}
	if item.URL != "https://www.wired.com/story/end-of-ai-content" {
		t.Errorf("expected URL 'https://www.wired.com/story/end-of-ai-content', got %q", item.URL)
	}
	if len(item.Authors) != 1 || item.Authors[0] != "Steven Levy" {
		t.Errorf("expected Authors '[Steven Levy]', got %v", item.Authors)
	}
	if len(item.ImageURLs) != 1 || item.ImageURLs[0] != "https://www.wired.com/hero.jpg" {
		t.Errorf("expected ImageURLs '[https://www.wired.com/hero.jpg]', got %v", item.ImageURLs)
	}
	if item.PublishedAt != "2026-06-09T01:00:00Z" {
		t.Errorf("expected PublishedAt '2026-06-09T01:00:00Z', got %q", item.PublishedAt)
	}
	if !strings.Contains(item.RawPayload, "Steven Levy") {
		t.Errorf("expected RawPayload to contain author 'Steven Levy', got %q", item.RawPayload)
	}
}

func TestAPICollector_Collect_NewsAPI_Unauthorized(t *testing.T) {
	mockResponse := `{
		"status": "error",
		"code": "apiKeyInvalid",
		"message": "Your API key is invalid or incorrect."
	}`

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(mockResponse))
	}))
	defer ts.Close()

	collector := New(2 * time.Second)
	source := domain.ArticleSource{
		Publisher:  "newsapi",
		SourceType: "api",
		Endpoint:   ts.URL,
		APIKey:     "invalid-key",
	}

	_, err := collector.Collect(context.Background(), source)
	if err == nil {
		t.Fatal("expected error on HTTP 401 unauthorized, got nil")
	}

	if !strings.Contains(err.Error(), "unauthorized") || !strings.Contains(err.Error(), "API key is invalid") {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestAPICollector_Collect_NewsAPI_RateLimited(t *testing.T) {
	mockResponse := `{
		"status": "error",
		"code": "rateLimited",
		"message": "You have made too many requests recently."
	}`

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(mockResponse))
	}))
	defer ts.Close()

	collector := New(2 * time.Second)
	source := domain.ArticleSource{
		Publisher:  "newsapi",
		SourceType: "api",
		Endpoint:   ts.URL,
	}

	_, err := collector.Collect(context.Background(), source)
	if err == nil {
		t.Fatal("expected error on HTTP 429 rate limited, got nil")
	}

	if !strings.Contains(err.Error(), "rate limited") || !strings.Contains(err.Error(), "too many requests") {
		t.Errorf("unexpected error message: %v", err)
	}
}
