package scraper

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/MythreshMukkara/new-collector/internal/domain"
	"github.com/PuerkitoBio/goquery"
)

// ExtractEenaduArticle scrapes an Eenadu article page and extracts metadata.
func ExtractEenaduArticle(ctx context.Context, client *http.Client, articleURL string) (*domain.ScrapedData, error) {
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
		return nil, fmt.Errorf("eenadu scraper returned status: %d", resp.StatusCode)
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
	doc.Find(".full-details p, .details-text p, .paragraph p, .custom-story p, article p, .text-justify p").Each(func(i int, s *goquery.Selection) {
		text := strings.TrimSpace(s.Text())
		if text != "" {
			paragraphs = append(paragraphs, text)
		}
	})
	scraped.Content = strings.Join(paragraphs, "\n\n")
	if scraped.Content == "" {
		scraped.Content = cleanText(doc.Find(".full-details, .details-text, .paragraph, article, .text-justify").Text())
	}

	// Publish Date
	scraped.PublishedAt = cleanText(doc.Find("meta[property='article:published_time']").AttrOr("content", ""))
	if scraped.PublishedAt == "" {
		scraped.PublishedAt = cleanText(doc.Find("meta[name='publish-date']").AttrOr("content", ""))
	}
	if scraped.PublishedAt == "" {
		doc.Find("script[type='application/ld+json']").Each(func(i int, s *goquery.Selection) {
			js := s.Text()
			if strings.Contains(js, `"datePublished"`) {
				idx := strings.Index(js, `"datePublished"`)
				if idx != -1 {
					sub := js[idx:]
					colIdx := strings.Index(sub, ":")
					if colIdx != -1 {
						val := sub[colIdx+1:]
						val = strings.TrimSpace(val)
						if len(val) > 0 && val[0] == '"' {
							endIdx := strings.Index(val[1:], `"`)
							if endIdx != -1 {
								scraped.PublishedAt = val[1 : endIdx+1]
							}
						}
					}
				}
			}
		})
	}

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
