package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/MythreshMukkara/new-collector/internal/config"
	"github.com/MythreshMukkara/new-collector/internal/domain"
	"github.com/twmb/franz-go/pkg/kgo"
)

type FranzProducer struct {
	cfg    config.KafkaConfig
	client *kgo.Client
	log    *slog.Logger
}

func New(cfg config.KafkaConfig, log *slog.Logger) (*FranzProducer, error) {
	if cfg.DryRun {
		log.Info("initializing Kafka producer in DRY-RUN mode (records will be printed to slog instead of Kafka broker)")
		return &FranzProducer{
			cfg: cfg,
			log: log,
		}, nil
	}

	client, err := kgo.NewClient(
		kgo.SeedBrokers(cfg.Brokers...),
		kgo.ClientID("news-collector-engine"),
		kgo.AllowAutoTopicCreation(),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create Franz Kafka client: %w", err)
	}

	return &FranzProducer{
		cfg:    cfg,
		client: client,
		log:    log,
	}, nil
}

// ProduceArticle serializes a normalized article and publishes it to the news.raw Kafka topic.
func (p *FranzProducer) ProduceArticle(ctx context.Context, article *domain.Article) error {
	data, err := json.Marshal(article)
	if err != nil {
		return fmt.Errorf("failed to marshal article: %w", err)
	}

	if p.cfg.DryRun {
		p.log.Info("[DRY-RUN KAFKA] Article produced to topic",
			slog.String("topic", p.cfg.Topic),
			slog.String("key", article.FingerprintHash),
			slog.String("title", article.Title),
			slog.String("payload_preview", truncateString(string(data), 200)),
		)
		return nil
	}

	record := &kgo.Record{
		Topic: p.cfg.Topic,
		Value: data,
		Key:   []byte(article.FingerprintHash), // Preserve stable ordering for specific articles using their fingerprint
	}

	results := p.client.ProduceSync(ctx, record)
	if err := results.FirstErr(); err != nil {
		return fmt.Errorf("failed to write record to Kafka: %w", err)
	}

	p.log.Info("article published to Kafka", slog.String("topic", p.cfg.Topic), slog.String("title", article.Title), slog.String("hash", article.FingerprintHash))
	return nil
}

// ProduceFailedEvent serializes a FailedEvent and writes it to the news.failed DLQ topic.
func (p *FranzProducer) ProduceFailedEvent(ctx context.Context, event *domain.FailedEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal failed event: %w", err)
	}

	if p.cfg.DryRun {
		p.log.Info("[DRY-RUN KAFKA] FailedEvent produced to topic",
			slog.String("topic", p.cfg.FailedTopic),
			slog.String("key", event.ID),
			slog.String("step", event.Step),
			slog.String("error", event.Error),
			slog.String("publisher", event.Source.Publisher),
		)
		return nil
	}

	record := &kgo.Record{
		Topic: p.cfg.FailedTopic,
		Value: data,
		Key:   []byte(event.ID),
	}

	results := p.client.ProduceSync(ctx, record)
	if err := results.FirstErr(); err != nil {
		return fmt.Errorf("failed to write failure record to Kafka: %w", err)
	}

	p.log.Info("failed event published to Kafka", slog.String("topic", p.cfg.FailedTopic), slog.String("step", event.Step), slog.String("id", event.ID))
	return nil
}

func (p *FranzProducer) Close() error {
	if p.client != nil {
		p.client.Close()
		p.log.Info("Kafka producer client closed successfully")
	}
	return nil
}

func truncateString(s string, limit int) string {
	if len(s) > limit {
		return s[:limit] + "..."
	}
	return s
}
