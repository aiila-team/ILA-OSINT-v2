package scraper

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/MythreshMukkara/new-collector/internal/domain"
	"github.com/PuerkitoBio/goquery"
)

// ExtractTV9Article scrapes a TV9 Telugu article page and extracts metadata.
func ExtractTV9Article(ctx context.Context, client *http.Client, articleURL string) (*domain.ScrapedData, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", articleURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tv9 scraper returned status: %d", resp.StatusCode)
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, err
	}

	scraped := &domain.ScrapedData{}

	// Title
	scraped.Title = cleanText(doc.Find("meta[property='og:title']").AttrOr("content", ""))
	if scraped.Title == "" {
		scraped.Title = cleanText(doc.Find("h1").First().Text())
	}

	// Summary
	scraped.Summary = cleanText(doc.Find("meta[property='og:description']").AttrOr("content", ""))

	// Content
	var paragraphs []string
	doc.Find(".article-content p, .entry-content p, .story-content p, .post-content p, article p, .ArticleBodyCont p").Each(func(i int, s *goquery.Selection) {
		text := strings.TrimSpace(s.Text())
		if text != "" {
			paragraphs = append(paragraphs, text)
		}
	})
	scraped.Content = strings.Join(paragraphs, "\n\n")
	if scraped.Content == "" {
		scraped.Content = cleanText(doc.Find(".article-content, .entry-content, .story-content, article, .ArticleBodyCont").Text())
	}

	// Publish Date
	scraped.PublishedAt = cleanText(doc.Find("meta[property='article:published_time']").AttrOr("content", ""))

	// Author
	author := cleanText(doc.Find("meta[name='author']").AttrOr("content", ""))
	if author != "" {
		scraped.Authors = append(scraped.Authors, author)
	}

	// Category
	category := cleanText(doc.Find("meta[property='article:section']").AttrOr("content", ""))
	if category != "" {
		scraped.Categories = append(scraped.Categories, category)
	}

	// Images
	img := cleanText(doc.Find("meta[property='og:image']").AttrOr("content", ""))
	if img != "" {
		scraped.ImageURLs = append(scraped.ImageURLs, img)
	}

	return scraped, nil
}
