package config

import (
	"os"

	"github.com/MythreshMukkara/new-collector/internal/domain"
	"gopkg.in/yaml.v3"
)

type FeedsConfig struct {
	Publishers   []PublisherFeedsConfig `yaml:"rss_source"`
	Sources      []APISourceConfig      `yaml:"api_sources"`
	ScrapSources []ScraperSourceConfig  `yaml:"scrap_sources"`
}

type PublisherFeedsConfig struct {
	Publisher  string                   `yaml:"publisher"`
	Country    string                   `yaml:"country"`
	Language   string                   `yaml:"language"`
	SourceType string                   `yaml:"source_type"` // e.g. "rss"
	Selectors  *domain.ScraperSelectors `yaml:"selectors,omitempty"`
	Feeds      []FeedConfig             `yaml:"feeds"`
}

type FeedConfig struct {
	Name string `yaml:"name"`
	URL  string `yaml:"url"`
}

type APISourceConfig struct {
	Publisher  string                   `yaml:"publisher"`
	Type       string                   `yaml:"type"` // e.g. "api", "rss"
	Endpoint   string                   `yaml:"endpoint"`
	APIKey     string                   `yaml:"api_key"`
	Country    string                   `yaml:"country"`
	Language   string                   `yaml:"language"`
	Selectors  *domain.ScraperSelectors `yaml:"selectors,omitempty"`
}

type ScraperSourceConfig struct {
	Publisher string                   `yaml:"publisher"`
	Type      string                   `yaml:"type"` // e.g. "scraper"
	BaseURL   string                   `yaml:"base_url"`
	Country   string                   `yaml:"country"`
	Language  string                   `yaml:"language"`
	Selectors *domain.ScraperSelectors `yaml:"selectors,omitempty"`
}

// LoadFeeds reads the hierarchical feeds structure and flattens it into a slice of domain.ArticleSource.
// It also expands environment variables in the config file.
func LoadFeeds(path string) ([]domain.ArticleSource, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	// Expand environment variables (like ${NEWS_API_KEY})
	expandedData := os.ExpandEnv(string(data))

	var fc FeedsConfig
	if err := yaml.Unmarshal([]byte(expandedData), &fc); err != nil {
		return nil, err
	}

	var sources []domain.ArticleSource
	
	// 1. Parse hierarchical rss_source entries
	for _, pub := range fc.Publishers {
		sourceType := pub.SourceType
		if sourceType == "" {
			sourceType = "rss" // default fallback
		}

		for _, feed := range pub.Feeds {
			sources = append(sources, domain.ArticleSource{
				Publisher:  pub.Publisher,
				FeedName:   feed.Name,
				FeedURL:    feed.URL,
				SourceType: sourceType,
				Country:    pub.Country,
				Language:   pub.Language,
				Selectors:  pub.Selectors,
			})
		}
	}

	// 2. Parse flat sources entries (RSS or API)
	for _, src := range fc.Sources {
		srcType := src.Type
		if srcType == "" {
			srcType = "api"
		}

		feedName := src.Publisher
		if srcType == "api" {
			feedName = src.Publisher + " API"
		}

		sources = append(sources, domain.ArticleSource{
			Publisher:  src.Publisher,
			FeedName:   feedName,
			FeedURL:    src.Endpoint,
			SourceType: srcType,
			Country:    src.Country,
			Language:   src.Language,
			Selectors:  src.Selectors,
			Endpoint:   src.Endpoint,
			APIKey:     src.APIKey,
		})
	}

	// 3. Parse flat scrap_sources entries (Scrapers)
	for _, src := range fc.ScrapSources {
		srcType := src.Type
		if srcType == "" {
			srcType = "scraper"
		}

		feedURL := src.BaseURL
		country := src.Country
		if country == "" {
			country = "in"
		}
		language := src.Language
		if language == "" {
			language = "te" // Default to Telugu
		}

		sources = append(sources, domain.ArticleSource{
			Publisher:  src.Publisher,
			FeedName:   src.Publisher + " Scraper",
			FeedURL:    feedURL,
			SourceType: srcType,
			Country:    country,
			Language:   language,
			Selectors:  src.Selectors,
			Endpoint:   src.BaseURL,
		})
	}

	return sources, nil
}
