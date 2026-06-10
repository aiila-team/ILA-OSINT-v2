package workerpool

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/MythreshMukkara/new-collector/internal/config"
	"github.com/MythreshMukkara/new-collector/internal/domain"
	"github.com/MythreshMukkara/new-collector/internal/hashing"
	"github.com/MythreshMukkara/new-collector/internal/metrics"
	"github.com/MythreshMukkara/new-collector/internal/normalizer"
	"github.com/google/uuid"
)

type Pool struct {
	cfg        config.WorkerPoolConfig
	strategies map[string]domain.CollectorStrategy
	extractor  domain.ContentExtractor
	normalizer *normalizer.Normalizer
	producer   domain.EventProducer
	log        *slog.Logger

	taskChan chan domain.ArticleSource
	wg       sync.WaitGroup

	mu      sync.Mutex
	stopped bool

	cacheMu        sync.RWMutex
	processedCache map[string]time.Time
}

func New(
	cfg config.WorkerPoolConfig,
	extractor domain.ContentExtractor,
	normalizer *normalizer.Normalizer,
	producer domain.EventProducer,
	log *slog.Logger,
) *Pool {
	return &Pool{
		cfg:            cfg,
		strategies:     make(map[string]domain.CollectorStrategy),
		extractor:      extractor,
		normalizer:     normalizer,
		producer:       producer,
		log:            log,
		taskChan:       make(chan domain.ArticleSource, cfg.QueueCapacity),
		processedCache: make(map[string]time.Time),
	}
}

// RegisterStrategy registers a collector strategy (e.g. RSS) in the pool.
func (p *Pool) RegisterStrategy(strategy domain.CollectorStrategy) {
	p.strategies[strategy.SourceType()] = strategy
}

// Start spawns the configured number of worker goroutines.
func (p *Pool) Start(ctx context.Context) {
	p.log.Info("starting worker pool", slog.Int("workers", p.cfg.NumWorkers), slog.Int("queue_capacity", p.cfg.QueueCapacity))

	for i := 1; i <= p.cfg.NumWorkers; i++ {
		p.wg.Add(1)
		go p.worker(ctx, i)
	}
}

// Submit enqueues a collection task. If queue is full, it will block (backpressure).
func (p *Pool) Submit(source domain.ArticleSource) {
	p.mu.Lock()
	if p.stopped {
		p.mu.Unlock()
		return
	}
	p.taskChan <- source
	metrics.QueueLength.Set(float64(len(p.taskChan)))
	p.mu.Unlock()
}

// Stop waits for all worker goroutines to complete after closing the channel.
func (p *Pool) Stop() {
	p.log.Info("shutting down worker pool...")
	
	p.mu.Lock()
	if !p.stopped {
		p.stopped = true
		close(p.taskChan)
	}
	p.mu.Unlock()

	p.wg.Wait()
	p.log.Info("worker pool stopped cleanly")
}

func (p *Pool) worker(ctx context.Context, id int) {
	defer p.wg.Done()

	metrics.ActiveWorkers.Inc()
	defer metrics.ActiveWorkers.Dec()

	for {
		select {
		case <-ctx.Done():
			p.log.Debug("worker exiting due to context cancel", slog.Int("worker_id", id))
			return
		case source, ok := <-p.taskChan:
			if !ok {
				p.log.Debug("worker exiting due to channel closed", slog.Int("worker_id", id))
				return
			}
			metrics.QueueLength.Set(float64(len(p.taskChan)))
			p.processSource(ctx, id, source)
		}
	}
}

// IsCached checks if a URL has already been successfully processed.
func (p *Pool) IsCached(url string) bool {
	normalizedURL := hashing.CleanAndNormalizeURL(url)
	p.cacheMu.RLock()
	defer p.cacheMu.RUnlock()
	_, exists := p.processedCache[normalizedURL]
	return exists
}

// CacheArticle adds a URL to the processed cache, cleaning up older entries if needed.
func (p *Pool) CacheArticle(url string) {
	normalizedURL := hashing.CleanAndNormalizeURL(url)
	p.cacheMu.Lock()
	defer p.cacheMu.Unlock()
	
	p.processedCache[normalizedURL] = time.Now()
	
	// Self-cleaning logic to prevent infinite memory growth
	if len(p.processedCache) > 50000 {
		// Clean entries older than 24 hours
		cutoff := time.Now().Add(-24 * time.Hour)
		for k, v := range p.processedCache {
			if v.Before(cutoff) {
				delete(p.processedCache, k)
			}
		}
	}
}

func (p *Pool) processSource(ctx context.Context, workerID int, source domain.ArticleSource) {
	p.log.Info("worker processing feed",
		slog.Int("worker_id", workerID),
		slog.String("publisher", source.Publisher),
		slog.String("feed_name", source.FeedName),
		slog.String("url", source.FeedURL),
	)

	strategy, exists := p.strategies[source.SourceType]
	if !exists {
		err := fmt.Errorf("unsupported source type: %s", source.SourceType)
		p.log.Error("unsupported strategy", slog.String("source_type", source.SourceType))
		p.publishFailure(source, err, "collect", "", 0)
		metrics.FeedsProcessedTotal.WithLabelValues(source.Publisher, "failed").Inc()
		return
	}

	// Fetch raw items using strategy with execution duration tracking
	startTime := time.Now()
	rawItems, err := strategy.Collect(ctx, source)
	duration := time.Since(startTime).Seconds()
	if err != nil {
		p.log.Error("feed collection failed",
			slog.String("publisher", source.Publisher),
			slog.String("feed_name", source.FeedName),
			slog.String("error", err.Error()),
		)
		p.publishFailure(source, err, "collect", "", 0)
		metrics.FeedsProcessedTotal.WithLabelValues(source.Publisher, "failed").Inc()
		return
	}

	metrics.ProcessingDuration.WithLabelValues(source.Publisher, "collect").Observe(duration)
	metrics.FeedsProcessedTotal.WithLabelValues(source.Publisher, "success").Inc()

	p.log.Info("fetched feed items successfully",
		slog.String("publisher", source.Publisher),
		slog.Int("count", len(rawItems)),
	)

	for _, item := range rawItems {
		// Verify context not canceled during iteration
		if ctx.Err() != nil {
			return
		}

		if p.IsCached(item.URL) {
			continue // Skip processing entirely to avoid duplicate scraping and publishing
		}

		articleScrapeSuccess := true
		// Always scrape the webpage if the URL is valid, merging it into the RSS payload
		if item.URL != "" {
			p.log.Debug("visiting article URL to scrape content and metadata", slog.String("url", item.URL))
			scrapeStart := time.Now()
			scraped, extractErr := p.extractor.Extract(ctx, item.URL, source)
			scrapeDuration := time.Since(scrapeStart).Seconds()
			if extractErr != nil {
				p.log.Warn("scraper content extraction failed, processing with feed content only",
					slog.String("url", item.URL),
					slog.String("error", extractErr.Error()),
				)
				p.publishFailure(source, extractErr, "extract", item.RawPayload, 0)
				articleScrapeSuccess = false
				// Continue processing using whatever feed content we have
			} else {
				metrics.ProcessingDuration.WithLabelValues(source.Publisher, "scrape").Observe(scrapeDuration)
				mergeScrapedData(item, scraped)
			}
		}

		// Normalize raw item
		article, normErr := p.normalizer.Normalize(ctx, item)
		if normErr != nil {
			p.log.Error("failed to normalize article",
				slog.String("url", item.URL),
				slog.String("error", normErr.Error()),
			)
			p.publishFailure(source, normErr, "normalize", item.RawPayload, 0)
			metrics.ArticlesProcessedTotal.WithLabelValues(source.Publisher, "failed").Inc()
			continue
		}

		// Publish to Kafka
		if pubErr := p.producer.ProduceArticle(ctx, article); pubErr != nil {
			p.log.Error("failed to publish article to Kafka",
				slog.String("title", article.Title),
				slog.String("error", pubErr.Error()),
			)
			metrics.ArticlesProcessedTotal.WithLabelValues(source.Publisher, "failed").Inc()
			// Publish failed event to DLQ
			articleBytes, _ := json.Marshal(article)
			p.publishFailure(source, pubErr, "publish", string(articleBytes), 0)
			// Kafka writing errors are critical, but we continue processing remaining items
		} else {
			status := "success"
			if !articleScrapeSuccess {
				status = "partial_success"
			}
			metrics.ArticlesProcessedTotal.WithLabelValues(source.Publisher, status).Inc()

			// Add successfully published article URL to cache
			p.CacheArticle(item.URL)
		}
	}
}

func (p *Pool) publishFailure(source domain.ArticleSource, err error, step string, rawPayload string, retryCount int) {
	failedEvent := &domain.FailedEvent{
		ID:         uuid.New().String(),
		Source:     source,
		Error:      err.Error(),
		Step:       step,
		OccurredAt: time.Now().UTC().Format(time.RFC3339),
		RawPayload: rawPayload,
		RetryCount: retryCount,
	}

	if pubErr := p.producer.ProduceFailedEvent(context.Background(), failedEvent); pubErr != nil {
		p.log.Error("failed to produce failed event into DLQ topic",
			slog.String("error", pubErr.Error()),
			slog.String("original_error", err.Error()),
		)
	}
}

// mergeScrapedData combines fields from the RSS feed item and the scraped HTML page.
// Standardizes fields to prevent duplicate metadata or empty entries.
func mergeScrapedData(item *domain.RawItem, scraped *domain.ScrapedData) {
	if scraped == nil {
		return
	}

	// 1. Content: Always take scraped content if available
	if scraped.Content != "" {
		item.Content = scraped.Content
	}

	// 2. Title: Use scraped title as fallback if original is empty or generic
	if strings.TrimSpace(item.Title) == "" && scraped.Title != "" {
		item.Title = scraped.Title
	}

	// 3. Summary: Use scraped summary as fallback if original is empty
	if strings.TrimSpace(item.Summary) == "" && scraped.Summary != "" {
		item.Summary = scraped.Summary
	}

	// 4. PublishedAt: Use scraped published date as fallback if original is empty
	if strings.TrimSpace(item.PublishedAt) == "" && scraped.PublishedAt != "" {
		item.PublishedAt = scraped.PublishedAt
	}

	// 5. Authors: Combine authors and let normalizer clean/deduplicate them
	if len(scraped.Authors) > 0 {
		item.Authors = append(item.Authors, scraped.Authors...)
	}

	// 6. Categories: Combine categories and let normalizer clean/deduplicate them
	if len(scraped.Categories) > 0 {
		item.Categories = append(item.Categories, scraped.Categories...)
	}

	// 7. Image URLs: Combine image URLs and let normalizer clean/deduplicate them
	if len(scraped.ImageURLs) > 0 {
		item.ImageURLs = append(item.ImageURLs, scraped.ImageURLs...)
	}
}
