package dlq

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/MythreshMukkara/new-collector/internal/config"
	"github.com/MythreshMukkara/new-collector/internal/domain"
	"github.com/MythreshMukkara/new-collector/internal/normalizer"
	"github.com/google/uuid"
	"github.com/twmb/franz-go/pkg/kgo"
)

type ProcessedCache interface {
	IsCached(url string) bool
	CacheArticle(url string)
}

type DLQConsumer struct {
	cfg        *config.Config
	strategies map[string]domain.CollectorStrategy
	extractor  domain.ContentExtractor
	normalizer *normalizer.Normalizer
	producer   domain.EventProducer
	cache      ProcessedCache
	log        *slog.Logger
	client     *kgo.Client
}

func NewConsumer(
	cfg *config.Config,
	extractor domain.ContentExtractor,
	normalizer *normalizer.Normalizer,
	producer domain.EventProducer,
	cache ProcessedCache,
	log *slog.Logger,
) (*DLQConsumer, error) {
	var client *kgo.Client
	if !cfg.Kafka.DryRun {
		var err error
		client, err = kgo.NewClient(
			kgo.SeedBrokers(cfg.Kafka.Brokers...),
			kgo.ClientID("news-collector-dlq-consumer"),
			kgo.ConsumerGroup("news-collector-dlq-group"),
			kgo.ConsumeTopics(cfg.Kafka.FailedTopic),
			kgo.AllowAutoTopicCreation(),
		)
		if err != nil {
			return nil, fmt.Errorf("failed to create DLQ Franz Kafka client: %w", err)
		}
	} else {
		log.Info("initializing DLQ consumer in DRY-RUN mode (mocked consumption)")
	}

	return &DLQConsumer{
		cfg:        cfg,
		strategies: make(map[string]domain.CollectorStrategy),
		extractor:  extractor,
		normalizer: normalizer,
		producer:   producer,
		cache:      cache,
		log:        log,
		client:     client,
	}, nil
}

func (c *DLQConsumer) RegisterStrategy(strategy domain.CollectorStrategy) {
	c.strategies[strategy.SourceType()] = strategy
}

func (c *DLQConsumer) Start(ctx context.Context) {
	c.log.Info("starting DLQ consumer",
		slog.String("failed_topic", c.cfg.Kafka.FailedTopic),
		slog.Int("num_workers", c.cfg.DLQ.NumWorkers),
		slog.Int("max_retries", c.cfg.DLQ.MaxRetries),
		slog.Duration("retry_delay", c.cfg.DLQ.RetryDelay),
	)

	if c.cfg.Kafka.DryRun {
		c.log.Info("DLQ consumer running in dry-run mode; skipping active Kafka polling")
		<-ctx.Done()
		return
	}

	defer func() {
		if c.client != nil {
			c.client.Close()
			c.log.Info("DLQ consumer Kafka client closed successfully")
		}
	}()

	var wg sync.WaitGroup
	// Start DLQ processing workers
	for i := 1; i <= c.cfg.DLQ.NumWorkers; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			c.workerLoop(ctx, workerID)
		}(i)
	}

	wg.Wait()
	c.log.Info("DLQ consumer stopped")
}

func (c *DLQConsumer) workerLoop(ctx context.Context, id int) {
	c.log.Debug("DLQ consumer worker started", slog.Int("worker_id", id))

	for {
		select {
		case <-ctx.Done():
			c.log.Debug("DLQ consumer worker exiting due to context cancel", slog.Int("worker_id", id))
			return
		default:
			fetches := c.client.PollFetches(ctx)
			if errs := fetches.Errors(); len(errs) > 0 {
				for _, err := range errs {
					c.log.Error("DLQ consumer PollFetches error", slog.String("error", err.Err.Error()))
				}
			}

			iter := fetches.RecordIter()
			for !iter.Done() {
				record := iter.Next()
				
				var event domain.FailedEvent
				if err := json.Unmarshal(record.Value, &event); err != nil {
					c.log.Error("failed to unmarshal DLQ record",
						slog.String("error", err.Error()),
						slog.String("payload_preview", truncateString(string(record.Value), 200)),
					)
					continue
				}

				c.log.Info("DLQ consumer received failed event",
					slog.Int("worker_id", id),
					slog.String("event_id", event.ID),
					slog.String("step", event.Step),
					slog.String("publisher", event.Source.Publisher),
					slog.Int("retry_count", event.RetryCount),
					slog.String("error", event.Error),
				)

				// Process event
				c.processEvent(ctx, &event)
			}
		}
	}
}

func (c *DLQConsumer) processEvent(ctx context.Context, event *domain.FailedEvent) {
	// If retries exceeded, discard or log permanently failed
	if event.RetryCount >= c.cfg.DLQ.MaxRetries {
		c.log.Error("DLQ event permanently failed: max retries reached",
			slog.String("event_id", event.ID),
			slog.String("step", event.Step),
			slog.String("publisher", event.Source.Publisher),
			slog.Int("retry_count", event.RetryCount),
			slog.String("error", event.Error),
		)
		return
	}

	// Apply backoff/delay before reprocessing
	if c.cfg.DLQ.RetryDelay > 0 {
		c.log.Debug("DLQ event retry delay active",
			slog.String("event_id", event.ID),
			slog.Duration("delay", c.cfg.DLQ.RetryDelay),
		)
		select {
		case <-ctx.Done():
			return
		case <-time.After(c.cfg.DLQ.RetryDelay):
		}
	}

	var err error
	switch event.Step {
	case "collect":
		err = c.retryCollect(ctx, event)
	case "extract":
		err = c.retryExtract(ctx, event)
	case "normalize":
		err = c.retryNormalize(ctx, event)
	case "publish":
		err = c.retryPublish(ctx, event)
	default:
		err = fmt.Errorf("unknown failed event step: %s", event.Step)
	}

	if err != nil {
		c.log.Error("DLQ event retry attempt failed",
			slog.String("event_id", event.ID),
			slog.String("step", event.Step),
			slog.Int("attempt", event.RetryCount+1),
			slog.String("error", err.Error()),
		)

		// Publish back to DLQ with incremented retry count
		c.publishFailure(event.Source, err, event.Step, event.RawPayload, event.RetryCount+1)
	} else {
		c.log.Info("DLQ event retried and processed successfully",
			slog.String("event_id", event.ID),
			slog.String("step", event.Step),
			slog.Int("attempt", event.RetryCount+1),
		)
	}
}

func (c *DLQConsumer) retryCollect(ctx context.Context, event *domain.FailedEvent) error {
	strategy, exists := c.strategies[event.Source.SourceType]
	if !exists {
		return fmt.Errorf("unsupported source type: %s", event.Source.SourceType)
	}

	rawItems, err := strategy.Collect(ctx, event.Source)
	if err != nil {
		return fmt.Errorf("collection strategy failed: %w", err)
	}

	c.log.Info("DLQ collect retry successfully fetched feed items",
		slog.String("publisher", event.Source.Publisher),
		slog.Int("count", len(rawItems)),
	)

	// Process raw items
	for _, item := range rawItems {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		if c.cache.IsCached(item.URL) {
			continue
		}

		if item.URL != "" {
			scraped, extractErr := c.extractor.Extract(ctx, item.URL, event.Source)
			if extractErr != nil {
				c.log.Warn("DLQ worker scrape failed, using feed content",
					slog.String("url", item.URL),
					slog.String("error", extractErr.Error()),
				)
				c.publishFailure(event.Source, extractErr, "extract", item.RawPayload, 0)
			} else {
				mergeScrapedData(item, scraped)
			}
		}

		article, normErr := c.normalizer.Normalize(ctx, item)
		if normErr != nil {
			c.log.Error("DLQ worker normalize failed",
				slog.String("url", item.URL),
				slog.String("error", normErr.Error()),
			)
			c.publishFailure(event.Source, normErr, "normalize", item.RawPayload, 0)
			continue
		}

		if pubErr := c.producer.ProduceArticle(ctx, article); pubErr != nil {
			c.log.Error("DLQ worker publish failed",
				slog.String("title", article.Title),
				slog.String("error", pubErr.Error()),
			)
			articleBytes, _ := json.Marshal(article)
			c.publishFailure(event.Source, pubErr, "publish", string(articleBytes), 0)
		} else {
			c.cache.CacheArticle(item.URL)
		}
	}

	return nil
}

func (c *DLQConsumer) retryExtract(ctx context.Context, event *domain.FailedEvent) error {
	var item domain.RawItem
	if err := json.Unmarshal([]byte(event.RawPayload), &item); err != nil {
		return fmt.Errorf("failed to unmarshal RawPayload to RawItem: %w", err)
	}

	// Re-scrape the article body
	scraped, extractErr := c.extractor.Extract(ctx, item.URL, event.Source)
	if extractErr != nil {
		return fmt.Errorf("extraction retry failed: %w", extractErr)
	}

	mergeScrapedData(&item, scraped)

	// Normalize
	article, normErr := c.normalizer.Normalize(ctx, &item)
	if normErr != nil {
		return fmt.Errorf("normalization after extract retry failed: %w", normErr)
	}

	// Publish
	if pubErr := c.producer.ProduceArticle(ctx, article); pubErr != nil {
		return fmt.Errorf("publishing after extract retry failed: %w", pubErr)
	}

	// Cache
	c.cache.CacheArticle(item.URL)
	return nil
}

func (c *DLQConsumer) retryNormalize(ctx context.Context, event *domain.FailedEvent) error {
	var item domain.RawItem
	if err := json.Unmarshal([]byte(event.RawPayload), &item); err != nil {
		return fmt.Errorf("failed to unmarshal RawPayload to RawItem: %w", err)
	}

	// Normalize
	article, normErr := c.normalizer.Normalize(ctx, &item)
	if normErr != nil {
		return fmt.Errorf("normalization retry failed: %w", normErr)
	}

	// Publish
	if pubErr := c.producer.ProduceArticle(ctx, article); pubErr != nil {
		return fmt.Errorf("publishing after normalize retry failed: %w", pubErr)
	}

	// Cache
	c.cache.CacheArticle(item.URL)
	return nil
}

func (c *DLQConsumer) retryPublish(ctx context.Context, event *domain.FailedEvent) error {
	var article domain.Article
	if err := json.Unmarshal([]byte(event.RawPayload), &article); err != nil {
		return fmt.Errorf("failed to unmarshal RawPayload to Article: %w", err)
	}

	// Re-attempt publish to Kafka topic
	if pubErr := c.producer.ProduceArticle(ctx, &article); pubErr != nil {
		return fmt.Errorf("publish retry failed: %w", pubErr)
	}

	// Cache
	c.cache.CacheArticle(article.URL)
	return nil
}

func (c *DLQConsumer) publishFailure(source domain.ArticleSource, err error, step string, rawPayload string, retryCount int) {
	failedEvent := &domain.FailedEvent{
		ID:         uuid.New().String(),
		Source:     source,
		Error:      err.Error(),
		Step:       step,
		OccurredAt: time.Now().UTC().Format(time.RFC3339),
		RawPayload: rawPayload,
		RetryCount: retryCount,
	}

	if pubErr := c.producer.ProduceFailedEvent(context.Background(), failedEvent); pubErr != nil {
		c.log.Error("DLQ consumer failed to produce failure record",
			slog.String("error", pubErr.Error()),
			slog.String("original_error", err.Error()),
		)
	}
}

func mergeScrapedData(item *domain.RawItem, scraped *domain.ScrapedData) {
	if scraped == nil {
		return
	}
	if scraped.Content != "" {
		item.Content = scraped.Content
	}
	if scraped.Title != "" && item.Title == "" {
		item.Title = scraped.Title
	}
	if scraped.Summary != "" && item.Summary == "" {
		item.Summary = scraped.Summary
	}
	if scraped.PublishedAt != "" && item.PublishedAt == "" {
		item.PublishedAt = scraped.PublishedAt
	}
	if len(scraped.Authors) > 0 {
		item.Authors = append(item.Authors, scraped.Authors...)
	}
	if len(scraped.Categories) > 0 {
		item.Categories = append(item.Categories, scraped.Categories...)
	}
	if len(scraped.ImageURLs) > 0 {
		item.ImageURLs = append(item.ImageURLs, scraped.ImageURLs...)
	}
}

func truncateString(s string, limit int) string {
	if len(s) > limit {
		return s[:limit] + "..."
	}
	return s
}
