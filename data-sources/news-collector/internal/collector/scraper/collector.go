package scraper

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/MythreshMukkara/new-collector/internal/domain"
	"github.com/PuerkitoBio/goquery"
)

type ScraperCollector struct {
	client *http.Client
}

func NewCollector(timeout time.Duration) *ScraperCollector {
	return &ScraperCollector{
		client: &http.Client{
			Timeout: timeout,
		},
	}
}

func (s *ScraperCollector) SourceType() string {
	return "scraper"
}

func (s *ScraperCollector) Collect(ctx context.Context, source domain.ArticleSource) ([]*domain.RawItem, error) {
	if source.FeedURL == "" {
		return nil, fmt.Errorf("base URL is empty")
	}

	publisherLower := strings.ToLower(source.Publisher)
	switch {
	case strings.Contains(publisherLower, "eenadu"):
		return s.collectEenadu(ctx, source)
	case strings.Contains(publisherLower, "tv9"):
		return s.collectTV9(ctx, source)
	default:
		return nil, fmt.Errorf("unsupported scraper publisher: %s", source.Publisher)
	}
}

func (s *ScraperCollector) collectEenadu(ctx context.Context, source domain.ArticleSource) ([]*domain.RawItem, error) {
	categories := []string{
		"https://www.eenadu.net/latest-news-list",
		"https://www.eenadu.net/india",
		"https://www.eenadu.net/world",
		"https://www.eenadu.net/andhra-pradesh",
		"https://www.eenadu.net/telangana",
		"https://www.eenadu.net/business",
	}

	uniqueLinks := make(map[string]bool)
	var links []string

	for _, catURL := range categories {
		req, err := http.NewRequestWithContext(ctx, "GET", catURL, nil)
		if err != nil {
			continue
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

		resp, err := s.client.Do(req)
		if err != nil {
			continue
		}
		
		doc, err := goquery.NewDocumentFromReader(resp.Body)
		resp.Body.Close()
		if err != nil {
			continue
		}

		doc.Find("a").Each(func(i int, sel *goquery.Selection) {
			href, exists := sel.Attr("href")
			if !exists {
				return
			}
			resolved := ResolveURL(catURL, href)
			if IsEenaduArticle(resolved) {
				if !uniqueLinks[resolved] {
					uniqueLinks[resolved] = true
					links = append(links, resolved)
				}
			}
		})
	}

	var items []*domain.RawItem
	for _, link := range links {
		items = append(items, &domain.RawItem{
			Source:      source,
			URL:         link,
			PublishedAt: time.Now().UTC().Format(time.RFC3339),
		})
	}

	return items, nil
}

func (s *ScraperCollector) collectTV9(ctx context.Context, source domain.ArticleSource) ([]*domain.RawItem, error) {
	categories := []string{
		"https://tv9telugu.com/latest-news",
		"https://tv9telugu.com/national",
		"https://tv9telugu.com/politics",
		"https://tv9telugu.com/andhra-pradesh",
		"https://tv9telugu.com/telangana",
		"https://tv9telugu.com/business",
	}

	uniqueLinks := make(map[string]bool)
	var links []string

	for _, catURL := range categories {
		req, err := http.NewRequestWithContext(ctx, "GET", catURL, nil)
		if err != nil {
			continue
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

		resp, err := s.client.Do(req)
		if err != nil {
			continue
		}

		doc, err := goquery.NewDocumentFromReader(resp.Body)
		resp.Body.Close()
		if err != nil {
			continue
		}

		doc.Find("a").Each(func(i int, sel *goquery.Selection) {
			href, exists := sel.Attr("href")
			if !exists {
				return
			}
			resolved := ResolveURL(catURL, href)
			if IsTV9Article(resolved) {
				if !uniqueLinks[resolved] {
					uniqueLinks[resolved] = true
					links = append(links, resolved)
				}
			}
		})
	}

	var items []*domain.RawItem
	for _, link := range links {
		items = append(items, &domain.RawItem{
			Source:      source,
			URL:         link,
			PublishedAt: time.Now().UTC().Format(time.RFC3339),
		})
	}

	return items, nil
}
