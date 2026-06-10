package api

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/MythreshMukkara/new-collector/internal/domain"
)

type APICollector struct {
	client *http.Client
}

func New(timeout time.Duration) *APICollector {
	return &APICollector{
		client: &http.Client{
			Timeout: timeout,
		},
	}
}

func (a *APICollector) SourceType() string {
	return "api"
}

func (a *APICollector) Collect(ctx context.Context, source domain.ArticleSource) ([]*domain.RawItem, error) {
	publisherLower := strings.ToLower(source.Publisher)

	switch {
	case strings.Contains(publisherLower, "newsapi"):
		return a.collectNewsAPI(ctx, source)
	case strings.Contains(publisherLower, "gnews"):
		return a.collectGNews(ctx, source)
	default:
		return nil, fmt.Errorf("unsupported API provider: %s", source.Publisher)
	}
}
