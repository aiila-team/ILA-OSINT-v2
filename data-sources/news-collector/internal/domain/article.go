package domain

type ArticleSource struct {
	Publisher  string            `json:"publisher" yaml:"publisher"`
	FeedName   string            `json:"feed_name" yaml:"feed_name"`
	FeedURL    string            `json:"feed_url" yaml:"feed_url"`
	SourceType string            `json:"source_type" yaml:"source_type"` // e.g. "rss", "api", "scrape"
	Country    string            `json:"country" yaml:"country"`
	Language   string            `json:"language" yaml:"language"`
	Selectors  *ScraperSelectors `json:"selectors,omitempty" yaml:"selectors,omitempty"`

	// API-specific configurations
	Endpoint string `json:"endpoint,omitempty" yaml:"endpoint,omitempty"`
	APIKey   string `json:"api_key,omitempty" yaml:"api_key,omitempty"`
}

type ScraperSelectors struct {
	BodySelector    string   `json:"body_selector" yaml:"body_selector"`
	RemoveSelectors []string `json:"remove_selectors" yaml:"remove_selectors"`
}

type Article struct {
	ID              string         `json:"id"`
	Source          ArticleSource  `json:"source"`
	Title           string         `json:"title"`
	Summary         string         `json:"summary"`
	Content         string         `json:"content"`
	URL             string         `json:"url"`
	Authors         []string       `json:"authors"`
	Categories      []string       `json:"categories"`
	PublishedAt     string         `json:"published_at"` // ISO8601 string
	CollectedAt     string         `json:"collected_at"` // ISO8601 string
	ImageURLs       []string       `json:"image_urls"`
	FingerprintHash string         `json:"fingerprint_hash"`
	IntegrityHash   string         `json:"integrity_hash"`
	Metadata        map[string]any `json:"metadata"`
}

type FailedEvent struct {
	ID         string        `json:"id"`
	Source     ArticleSource `json:"source"`
	Error      string        `json:"error"`
	Step       string        `json:"step"`       // "collect", "extract", "normalize", "publish"
	OccurredAt string        `json:"occurred_at"` // ISO8601 string
	RawPayload string        `json:"raw_payload"`
	RetryCount int           `json:"retry_count"`
}
