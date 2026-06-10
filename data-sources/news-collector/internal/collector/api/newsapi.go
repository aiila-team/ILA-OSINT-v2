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

type NewsAPIResponse struct {
	Status       string           `json:"status"`
	Code         string           `json:"code"`
	Message      string           `json:"message"`
	TotalResults int              `json:"totalResults"`
	Articles     []NewsAPIArticle `json:"articles"`
}

type NewsAPIArticle struct {
	Source      NewsAPISource `json:"source"`
	Author      string        `json:"author"`
	Title       string        `json:"title"`
	Description string        `json:"description"`
	URL         string        `json:"url"`
	URLToImage  string        `json:"urlToImage"`
	PublishedAt string        `json:"publishedAt"`
	Content     string        `json:"content"`
}

type NewsAPISource struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func (a *APICollector) collectNewsAPI(ctx context.Context, source domain.ArticleSource) ([]*domain.RawItem, error) {
	endpoint := source.Endpoint
	if endpoint == "" {
		endpoint = "https://newsapi.org/v2/top-headlines"
	}

	u, err := url.Parse(endpoint)
	if err != nil {
		return nil, fmt.Errorf("invalid endpoint URL for NewsAPI: %w", err)
	}

	q := u.Query()
	if source.APIKey != "" {
		q.Set("apiKey", source.APIKey)
	}
	if source.Country != "" {
		q.Set("country", strings.ToLower(source.Country))
	}
	if source.Language != "" {
		q.Set("language", strings.ToLower(source.Language))
	}
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create NewsAPI request: %w", err)
	}

	req.Header.Set("User-Agent", "NewsCollectorEngine/1.0 (OSINT Subsystem)")

	resp, err := a.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute NewsAPI request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var apiErr struct {
			Status  string `json:"status"`
			Code    string `json:"code"`
			Message string `json:"message"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&apiErr)
		
		errMsg := apiErr.Message
		if errMsg == "" {
			errMsg = fmt.Sprintf("HTTP status code %d", resp.StatusCode)
		}

		switch resp.StatusCode {
		case http.StatusUnauthorized:
			return nil, fmt.Errorf("unauthorized: invalid API key: %s", errMsg)
		case http.StatusForbidden:
			return nil, fmt.Errorf("forbidden: access denied: %s", errMsg)
		case http.StatusTooManyRequests:
			return nil, fmt.Errorf("rate limited: too many requests: %s", errMsg)
		case http.StatusInternalServerError:
			return nil, fmt.Errorf("internal server error from NewsAPI: %s", errMsg)
		default:
			return nil, fmt.Errorf("NewsAPI collection failed: status %d: %s", resp.StatusCode, errMsg)
		}
	}

	var apiResp NewsAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, fmt.Errorf("failed to parse NewsAPI JSON response: %w", err)
	}

	if apiResp.Status == "error" {
		return nil, fmt.Errorf("NewsAPI error response (code %s): %s", apiResp.Code, apiResp.Message)
	}

	var items []*domain.RawItem
	for _, article := range apiResp.Articles {
		rawBytes, _ := json.Marshal(article)

		var authors []string
		if article.Author != "" {
			authors = append(authors, article.Author)
		}

		var imageURLs []string
		if article.URLToImage != "" {
			imageURLs = append(imageURLs, article.URLToImage)
		}

		item := &domain.RawItem{
			Source:      source,
			Title:       article.Title,
			Summary:     article.Description,
			Content:     article.Content,
			URL:         article.URL,
			PublishedAt: article.PublishedAt,
			Authors:     authors,
			ImageURLs:   imageURLs,
			RawPayload:  string(rawBytes),
		}
		items = append(items, item)
	}

	return items, nil
}
