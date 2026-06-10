//go:build live
// +build live

package scraper

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/MythreshMukkara/new-collector/internal/domain"
)

func TestLiveEenaduScraping(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	collector := NewCollector(15 * time.Second)
	source := domain.ArticleSource{
		Publisher: "eenadu",
		FeedURL:   "https://www.eenadu.net",
	}

	t.Log("Collecting links from Eenadu...")
	items, err := collector.Collect(ctx, source)
	if err != nil {
		t.Fatalf("Failed to collect from Eenadu: %v", err)
	}

	t.Logf("Collected %d potential article links from Eenadu", len(items))
	if len(items) == 0 {
		t.Fatal("No article links collected from Eenadu")
	}

	// Try to scrape the first few articles to see if we can extract content
	successCount := 0
	client := &http.Client{Timeout: 10 * time.Second}
	for i, item := range items {
		if i >= 3 {
			break
		}
		t.Logf("Scraping Eenadu article %d: %s", i+1, item.URL)
		scraped, err := ExtractEenaduArticle(ctx, client, item.URL)
		if err != nil {
			t.Errorf("Failed to scrape article %s: %v", item.URL, err)
			continue
		}

		t.Logf("Scraped article details:")
		t.Logf("  Title: %q", scraped.Title)
		t.Logf("  Publish Date: %q", scraped.PublishedAt)
		t.Logf("  Content Length: %d chars", len(scraped.Content))
		t.Logf("  First 100 chars of Content: %q", limitString(scraped.Content, 100))

		if scraped.Title == "" {
			t.Errorf("Scraped empty title for URL %s", item.URL)
		}
		if scraped.Content == "" {
			t.Errorf("Scraped empty content for URL %s", item.URL)
		} else {
			successCount++
		}
	}

	if successCount == 0 {
		t.Error("Failed to scrape any of the sampled Eenadu articles successfully")
	}
}

func TestLiveTV9Scraping(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	collector := NewCollector(15 * time.Second)
	source := domain.ArticleSource{
		Publisher: "tv9_telugu",
		FeedURL:   "https://tv9telugu.com",
	}

	t.Log("Collecting links from TV9...")
	items, err := collector.Collect(ctx, source)
	if err != nil {
		t.Fatalf("Failed to collect from TV9: %v", err)
	}

	t.Logf("Collected %d potential article links from TV9", len(items))
	if len(items) == 0 {
		t.Fatal("No article links collected from TV9")
	}

	// Try to scrape the first few articles to see if we can extract content
	successCount := 0
	client := &http.Client{Timeout: 10 * time.Second}
	for i, item := range items {
		if i >= 3 {
			break
		}
		t.Logf("Scraping TV9 article %d: %s", i+1, item.URL)
		scraped, err := ExtractTV9Article(ctx, client, item.URL)
		if err != nil {
			t.Errorf("Failed to scrape article %s: %v", item.URL, err)
			continue
		}

		t.Logf("Scraped article details:")
		t.Logf("  Title: %q", scraped.Title)
		t.Logf("  Publish Date: %q", scraped.PublishedAt)
		t.Logf("  Content Length: %d chars", len(scraped.Content))
		t.Logf("  First 100 chars of Content: %q", limitString(scraped.Content, 100))

		if scraped.Title == "" {
			t.Errorf("Scraped empty title for URL %s", item.URL)
		}
		if scraped.Content == "" {
			t.Errorf("Scraped empty content for URL %s", item.URL)
		} else {
			successCount++
		}
	}

	if successCount == 0 {
		t.Error("Failed to scrape any of the sampled TV9 articles successfully")
	}
}

func limitString(s string, limit int) string {
	if len(s) > limit {
		return s[:limit] + "..."
	}
	return s
}
