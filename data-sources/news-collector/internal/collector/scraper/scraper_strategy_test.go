package scraper

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/PuerkitoBio/goquery"
)

func TestScraperCollector_Collect_Eenadu(t *testing.T) {
	htmlBody := `
		<a href="/national/story-12345.html">National Story</a>
		<a href="https://www.eenadu.net/telangana/news-67890.html">Telangana News</a>
		<a href="/about-us">About Us</a>
	`
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(htmlBody))
	if err != nil {
		t.Fatalf("failed to create doc: %v", err)
	}

	var parsedLinks []string
	doc.Find("a").Each(func(i int, sel *goquery.Selection) {
		href, exists := sel.Attr("href")
		if !exists {
			return
		}
		resolved := ResolveURL("https://www.eenadu.net", href)
		if IsEenaduArticle(resolved) {
			parsedLinks = append(parsedLinks, resolved)
		}
	})

	if len(parsedLinks) != 2 {
		t.Errorf("expected 2 parsed links, got %d: %v", len(parsedLinks), parsedLinks)
	}

	if parsedLinks[0] != "https://www.eenadu.net/national/story-12345.html" {
		t.Errorf("unexpected link 0: %s", parsedLinks[0])
	}
	if parsedLinks[1] != "https://www.eenadu.net/telangana/news-67890.html" {
		t.Errorf("unexpected link 1: %s", parsedLinks[1])
	}
}

func TestScraperCollector_Collect_TV9(t *testing.T) {
	htmlBody := `
		<a href="/national/tv9-national-news-today-1111.html">National News</a>
		<a href="https://tv9telugu.com/telangana/hyderabad/hyderabad-rains-live-2222.html">Hyderabad Rains</a>
		<a href="/privacy-policy">Privacy</a>
	`
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(htmlBody))
	if err != nil {
		t.Fatalf("failed to create doc: %v", err)
	}

	var parsedLinks []string
	doc.Find("a").Each(func(i int, sel *goquery.Selection) {
		href, exists := sel.Attr("href")
		if !exists {
			return
		}
		resolved := ResolveURL("https://tv9telugu.com", href)
		if IsTV9Article(resolved) {
			parsedLinks = append(parsedLinks, resolved)
		}
	})

	if len(parsedLinks) != 2 {
		t.Errorf("expected 2 parsed links, got %d: %v", len(parsedLinks), parsedLinks)
	}

	if parsedLinks[0] != "https://tv9telugu.com/national/tv9-national-news-today-1111.html" {
		t.Errorf("unexpected link 0: %s", parsedLinks[0])
	}
	if parsedLinks[1] != "https://tv9telugu.com/telangana/hyderabad/hyderabad-rains-live-2222.html" {
		t.Errorf("unexpected link 1: %s", parsedLinks[1])
	}
}

func TestExtractEenaduArticle(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`
			<!DOCTYPE html>
			<html>
			<head>
				<meta property="og:title" content="Eenadu News Title" />
				<meta property="og:description" content="Eenadu News Description" />
				<meta property="article:published_time" content="2026-06-10T00:00:00Z" />
			</head>
			<body>
				<div class="full-details">
					<p>Eenadu Paragraph 1</p>
					<p>Eenadu Paragraph 2</p>
				</div>
			</body>
			</html>
		`))
	}))
	defer ts.Close()

	client := &http.Client{Timeout: 2 * time.Second}
	scraped, err := ExtractEenaduArticle(context.Background(), client, ts.URL)
	if err != nil {
		t.Fatalf("unexpected extract error: %v", err)
	}

	if scraped.Title != "Eenadu News Title" {
		t.Errorf("expected title 'Eenadu News Title', got %q", scraped.Title)
	}
	if !strings.Contains(scraped.Content, "Eenadu Paragraph 1") || !strings.Contains(scraped.Content, "Eenadu Paragraph 2") {
		t.Errorf("expected content to contain paragraphs, got %q", scraped.Content)
	}
}

func TestExtractTV9Article(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`
			<!DOCTYPE html>
			<html>
			<head>
				<meta property="og:title" content="TV9 News Title" />
				<meta property="og:description" content="TV9 News Description" />
				<meta property="article:published_time" content="2026-06-10T00:00:00Z" />
			</head>
			<body>
				<div class="article-content">
					<p>TV9 Paragraph 1</p>
					<p>TV9 Paragraph 2</p>
				</div>
			</body>
			</html>
		`))
	}))
	defer ts.Close()

	client := &http.Client{Timeout: 2 * time.Second}
	scraped, err := ExtractTV9Article(context.Background(), client, ts.URL)
	if err != nil {
		t.Fatalf("unexpected extract error: %v", err)
	}

	if scraped.Title != "TV9 News Title" {
		t.Errorf("expected title 'TV9 News Title', got %q", scraped.Title)
	}
	if !strings.Contains(scraped.Content, "TV9 Paragraph 1") || !strings.Contains(scraped.Content, "TV9 Paragraph 2") {
		t.Errorf("expected content to contain paragraphs, got %q", scraped.Content)
	}
}
