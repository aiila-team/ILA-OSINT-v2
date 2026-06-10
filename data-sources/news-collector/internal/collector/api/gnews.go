package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	
	"github.com/MythreshMukkara/new-collector/internal/domain"
)

func (a *APICollector) collectGNews(ctx context.Context, source domain.ArticleSource) ([]*domain.RawItem, error) {
	endpoint := source.Endpoint
	if endpoint == "" {
		endpoint = "https://gnews.io/api/v4/top-headlines"
	}

	u, err := url.Parse(endpoint)
	if err != nil {
		return nil, fmt.Errorf("invalid endpoint URL for GNews: %w", err)
	}

	q := u.Query()
	if source.APIKey != "" {
		q.Set("token", source.APIKey)
	}
	if source.Country != "" {
		q.Set("country", strings.ToLower(source.Country))
	}
	if source.Language != "" {
		q.Set("lang", strings.ToLower(source.Language))
	}
	u.RawQuery = q.Encode()

	// If no API key is configured or set to STUB, act as a scaffold stub
	if source.APIKey == "" || source.APIKey == "STUB" {
		return []*domain.RawItem{
			{
				Source:      source,
				Title:       "GNews Scaffold Article Title",
				Summary:     "This is a scaffold article description from GNews stub.",
				Content:     "This is full text content for the GNews scaffold stub.",
				URL:         "https://example.com/gnews-scaffold",
				PublishedAt: "2026-06-09T01:00:00Z",
				Authors:     []string{"GNews Stub Author"},
				ImageURLs:   []string{"https://example.com/gnews-stub.jpg"},
				RawPayload:  `{"title":"GNews Scaffold Article Title","description":"This is a scaffold article description"}`,
			},
		}, nil
	}

	req, err := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create GNews request: %w", err)
	}

	req.Header.Set("User-Agent", "NewsCollectorEngine/1.0 (OSINT Subsystem)")

	resp, err := a.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute GNews request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var gnewsErr struct {
			Errors []string `json:"errors"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&gnewsErr)
		
		errMsg := ""
		if len(gnewsErr.Errors) > 0 {
			errMsg = strings.Join(gnewsErr.Errors, "; ")
		} else {
			errMsg = fmt.Sprintf("HTTP status code %d", resp.StatusCode)
		}

		switch resp.StatusCode {
		case http.StatusUnauthorized:
			return nil, fmt.Errorf("unauthorized: invalid API key (GNews): %s", errMsg)
		case http.StatusForbidden:
			return nil, fmt.Errorf("forbidden: access denied (GNews): %s", errMsg)
		case http.StatusTooManyRequests:
			return nil, fmt.Errorf("rate limited: too many requests (GNews): %s", errMsg)
		default:
			return nil, fmt.Errorf("GNews collection failed: status %d: %s", resp.StatusCode, errMsg)
		}
	}

	var gnewsResp struct {
		TotalArticles int `json:"totalArticles"`
		Articles      []struct {
			Title       string `json:"title"`
			Description string `json:"description"`
			Content     string `json:"content"`
			URL         string `json:"url"`
			Image       string `json:"image"`
			PublishedAt string `json:"publishedAt"`
			Source      struct {
				Name string `json:"name"`
				URL  string `json:"url"`
			} `json:"source"`
		} `json:"articles"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&gnewsResp); err != nil {
		return nil, fmt.Errorf("failed to parse GNews JSON response: %w", err)
	}

	var items []*domain.RawItem
	for _, article := range gnewsResp.Articles {
		rawBytes, _ := json.Marshal(article)

		var imageURLs []string
		if article.Image != "" {
			imageURLs = append(imageURLs, article.Image)
		}

		item := &domain.RawItem{
			Source:      source,
			Title:       article.Title,
			Summary:     article.Description,
			Content:     article.Content,
			URL:         article.URL,
			PublishedAt: article.PublishedAt,
			Authors:     []string{article.Source.Name},
			ImageURLs:   imageURLs,
			RawPayload:  string(rawBytes),
		}
		items = append(items, item)
	}

	return items, nil
}
