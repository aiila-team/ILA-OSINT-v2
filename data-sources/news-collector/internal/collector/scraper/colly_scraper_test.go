package scraper

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/MythreshMukkara/new-collector/internal/config"
	"github.com/MythreshMukkara/new-collector/internal/domain"
)

func TestCollyScraper_Extract(t *testing.T) {
	// Spin up local HTTP server to return mock article HTML page with OG metadata tags
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`
			<!DOCTYPE html>
			<html>
			<head>
				<title>Test News Title</title>
				<meta property="og:title" content="Scraped OpenGraph Title" />
				<meta property="og:description" content="Scraped OpenGraph Description" />
				<meta property="og:image" content="https://example.com/hero.jpg" />
				<meta property="article:published_time" content="2026-06-08T03:54:46Z" />
				<meta name="author" content="Mock Author" />
			</head>
			<body>
				<header>
					<nav><a href="#">Home</a> | <a href="#">Politics</a></nav>
				</header>
				<main class="article-container">
					<h1 class="headline">Breaking: Go 1.25 Released</h1>
					<div class="ads">Ad Content: Buy shoes now!</div>
					<p class="paragraph-1">First paragraph containing core news body text.</p>
					<p class="paragraph-2">Second paragraph detailing engineering features.</p>
					<div class="newsletter-signup">Sign up to get our emails.</div>
				</main>
				<footer>
					<p>&copy; 2026 News Subsystem</p>
				</footer>
			</body>
			</html>
		`))
	}))
	defer ts.Close()

	cfg := config.ScraperConfig{
		UserAgent:    "TestAgent/1.0",
		Timeout:      2 * time.Second,
		RequestDelay: 0,
		MaxRedirects: 2,
	}

	scraper := New(cfg)
	source := domain.ArticleSource{
		Publisher: "MockPublisher",
		Selectors: &domain.ScraperSelectors{
			BodySelector:    ".article-container",
			RemoveSelectors: []string{".ads", ".newsletter-signup"},
		},
	}

	scraped, err := scraper.Extract(context.Background(), ts.URL, source)
	if err != nil {
		t.Fatalf("unexpected scraper execution failure: %v", err)
	}

	// 1. Assert metadata fields were parsed correctly from headers
	if scraped.Title != "Scraped OpenGraph Title" {
		t.Errorf("expected Title 'Scraped OpenGraph Title', got %q", scraped.Title)
	}
	if scraped.Summary != "Scraped OpenGraph Description" {
		t.Errorf("expected Summary 'Scraped OpenGraph Description', got %q", scraped.Summary)
	}
	if scraped.PublishedAt != "2026-06-08T03:54:46Z" {
		t.Errorf("expected PublishedAt '2026-06-08T03:54:46Z', got %q", scraped.PublishedAt)
	}
	if len(scraped.Authors) != 1 || scraped.Authors[0] != "Mock Author" {
		t.Errorf("expected Authors '[Mock Author]', got %v", scraped.Authors)
	}
	if len(scraped.ImageURLs) != 1 || scraped.ImageURLs[0] != "https://example.com/hero.jpg" {
		t.Errorf("expected ImageURLs '[https://example.com/hero.jpg]', got %v", scraped.ImageURLs)
	}

	// 2. Assert that unwanted body nodes were cleaned
	extractedText := scraped.Content
	if strings.Contains(extractedText, "Buy shoes now") {
		t.Error("expected advertisement div to be stripped, but it was found in output")
	}
	if strings.Contains(extractedText, "Sign up to get our emails") {
		t.Error("expected newsletter subscription block to be stripped, but it was found in output")
	}
	if strings.Contains(extractedText, "Home") || strings.Contains(extractedText, "Politics") {
		t.Error("expected header navigation text to be stripped, but it was found in output")
	}
	if strings.Contains(extractedText, "News Subsystem") {
		t.Error("expected footer text to be stripped, but it was found in output")
	}

	// 3. Assert that actual article content remains
	if !strings.Contains(extractedText, "First paragraph containing core news body text") {
		t.Error("missing expected first paragraph content")
	}
	if !strings.Contains(extractedText, "Second paragraph detailing engineering features") {
		t.Error("missing expected second paragraph content")
	}
}

func TestCollyScraper_Extract_ReadabilityFallback(t *testing.T) {
	// Spin up local HTTP server to return mock article HTML without metadata, relying on readability
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`
			<!DOCTYPE html>
			<html>
			<head>
				<title>Default Page Title</title>
			</head>
			<body>
				<header>
					<nav><a href="#">Menu Item 1</a> | <a href="#">Menu Item 2</a></nav>
				</header>
				<main>
					<article>
						<h1>Heuristic Article Title</h1>
						<p class="lead">This is the leading paragraph of our news story, which is extracted by readability.</p>
						<p>This is the second paragraph. It contains enough text and density to be considered main body content by the go-readability library.</p>
					</article>
				</main>
				<footer>
					<p>&copy; 2026 Footer info</p>
				</footer>
			</body>
			</html>
		`))
	}))
	defer ts.Close()

	cfg := config.ScraperConfig{
		UserAgent:    "TestAgent/1.0",
		Timeout:      2 * time.Second,
		RequestDelay: 0,
		MaxRedirects: 2,
	}

	scraper := New(cfg)
	// No selectors provided, should trigger readability fallback
	source := domain.ArticleSource{
		Publisher: "FallbackPublisher",
		Selectors: nil,
	}

	scraped, err := scraper.Extract(context.Background(), ts.URL, source)
	if err != nil {
		t.Fatalf("unexpected scraper execution failure: %v", err)
	}

	// 1. Assert title was parsed (fallback to readability/h1/title)
	if scraped.Title != "Heuristic Article Title" && scraped.Title != "Default Page Title" {
		t.Errorf("expected Title to be extracted, got %q", scraped.Title)
	}

	// 2. Assert body text was extracted using readability heuristic
	extractedText := scraped.Content
	if !strings.Contains(extractedText, "This is the leading paragraph of our news story") {
		t.Error("missing expected readability content paragraph 1")
	}
	if !strings.Contains(extractedText, "This is the second paragraph") {
		t.Error("missing expected readability content paragraph 2")
	}

	// 3. Ensure boilerplate header/footer are not in body content
	if strings.Contains(extractedText, "Menu Item 1") {
		t.Error("expected header menu to be stripped by readability")
	}
	if strings.Contains(extractedText, "Footer info") {
		t.Error("expected footer to be stripped by readability")
	}
}

