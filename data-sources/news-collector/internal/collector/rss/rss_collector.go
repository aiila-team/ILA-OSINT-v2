package rss

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/MythreshMukkara/new-collector/internal/domain"
	"github.com/mmcdole/gofeed"
)

type RSSCollector struct {
	client *http.Client
}

func New(timeout time.Duration) *RSSCollector {
	return &RSSCollector{
		client: &http.Client{
			Timeout: timeout,
		},
	}
}

func (r *RSSCollector) SourceType() string {
	return "rss"
}

// Collect fetches the RSS feed content, parses it, and maps it to domain.RawItem records.
func (r *RSSCollector) Collect(ctx context.Context, source domain.ArticleSource) ([]*domain.RawItem, error) {
	if source.FeedURL == "" {
		return nil, fmt.Errorf("feed URL is empty")
	}

	req, err := http.NewRequestWithContext(ctx, "GET", source.FeedURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("User-Agent", "NewsCollectorEngine/1.0 (OSINT Subsystem)")

	resp, err := r.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch RSS: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("received non-200 HTTP status code: %d", resp.StatusCode)
	}

	parser := gofeed.NewParser()
	feed, err := parser.Parse(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to parse RSS XML stream: %w", err)
	}

	var items []*domain.RawItem
	for _, entry := range feed.Items {
		if entry == nil {
			continue
		}

		rawJSON, _ := json.Marshal(entry)

		item := &domain.RawItem{
			Source:      source,
			Title:       entry.Title,
			Summary:     entry.Description,
			Content:     entry.Content,
			URL:         entry.Link,
			PublishedAt: getPublishedDate(entry),
			Authors:     getAuthors(entry),
			Categories:  entry.Categories,
			ImageURLs:   getImageURLs(entry),
			RawPayload:  string(rawJSON),
		}

		items = append(items, item)
	}

	return items, nil
}

func getPublishedDate(item *gofeed.Item) string {
	if item.Published != "" {
		return item.Published
	}
	if item.Updated != "" {
		return item.Updated
	}
	return ""
}

func getAuthors(item *gofeed.Item) []string {
	var list []string
	if item.Author != nil && item.Author.Name != "" {
		list = append(list, item.Author.Name)
	}
	for _, auth := range item.Authors {
		if auth != nil && auth.Name != "" {
			list = append(list, auth.Name)
		}
	}
	return list
}

func getImageURLs(item *gofeed.Item) []string {
	var list []string

	// Enclosures
	for _, enc := range item.Enclosures {
		if enc != nil && strings.HasPrefix(enc.Type, "image/") {
			list = append(list, enc.URL)
		}
	}

	// Media Extensions
	if item.Extensions != nil {
		if media, ok := item.Extensions["media"]; ok {
			// media:content
			if contents, ok := media["content"]; ok {
				for _, c := range contents {
					if urlVal, ok := c.Attrs["url"]; ok {
						list = append(list, urlVal)
					}
				}
			}
			// media:thumbnail
			if thumbs, ok := media["thumbnail"]; ok {
				for _, t := range thumbs {
					if urlVal, ok := t.Attrs["url"]; ok {
						list = append(list, urlVal)
					}
				}
			}
		}
	}

	return list
}
