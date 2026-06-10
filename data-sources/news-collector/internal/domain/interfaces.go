package domain

import "context"

// CollectorStrategy defines the interface for collecting raw items from a news source.
type CollectorStrategy interface {
	Collect(ctx context.Context, source ArticleSource) ([]*RawItem, error)
	SourceType() string
}

// ScrapedData holds metadata and content extracted directly from an article's HTML page.
type ScrapedData struct {
	Content     string
	Title       string
	Summary     string
	Authors     []string
	Categories  []string
	PublishedAt string
	ImageURLs   []string
}

// ContentExtractor defines the interface for scraping and extracting full article body from a webpage.
type ContentExtractor interface {
	Extract(ctx context.Context, url string, source ArticleSource) (*ScrapedData, error)
}

// EventProducer defines the interface for publishing normalized events and failed records to Kafka.
type EventProducer interface {
	ProduceArticle(ctx context.Context, article *Article) error
	ProduceFailedEvent(ctx context.Context, event *FailedEvent) error
	Close() error
}

// RawItem holds raw intermediate data fetched from feeds or APIs before normalization.
type RawItem struct {
	Source      ArticleSource
	Title       string
	Summary     string
	Content     string
	URL         string
	Authors     []string
	Categories  []string
	PublishedAt string // Raw string
	ImageURLs   []string
	RawPayload  string // Full JSON or XML snippet for provenance
}
