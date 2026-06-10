package config

import "time"

type Config struct {
	App        AppConfig        `yaml:"app"`
	Kafka      KafkaConfig      `yaml:"kafka"`
	WorkerPool WorkerPoolConfig `yaml:"worker_pool"`
	Scraper    ScraperConfig    `yaml:"scraper"`
	Metrics    MetricsConfig    `yaml:"metrics"`
	DLQ        DLQConfig        `yaml:"dlq"`
	FeedsPath  string           `yaml:"feeds_path" env:"FEEDS_PATH" env-default:"configs/feeds.yaml"`
}

type MetricsConfig struct {
	Port int `yaml:"port" env:"METRICS_PORT" env-default:"2112"`
}

type AppConfig struct {
	Name        string `yaml:"name"`
	Environment string `yaml:"environment" env:"APP_ENV" env-default:"development"`
}

type KafkaConfig struct {
	Brokers     []string `yaml:"brokers" env:"KAFKA_BROKERS" env-separator:","`
	Topic       string   `yaml:"topic" env:"KAFKA_TOPIC" env-default:"news.raw"`
	FailedTopic string   `yaml:"failed_topic" env:"KAFKA_FAILED_TOPIC" env-default:"news.failed"`
	DryRun      bool     `yaml:"dry_run" env:"KAFKA_DRY_RUN" env-default:"false"`
}

type WorkerPoolConfig struct {
	NumWorkers    int           `yaml:"num_workers" env:"WORKER_POOL_SIZE" env-default:"10"`
	QueueCapacity int           `yaml:"queue_capacity" env:"WORKER_QUEUE_CAPACITY" env-default:"100"`
	PollInterval  time.Duration `yaml:"poll_interval" env-default:"5m"`
}

type ScraperConfig struct {
	UserAgent    string        `yaml:"user_agent" env-default:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"`
	Timeout      time.Duration `yaml:"timeout" env-default:"15s"`
	RequestDelay time.Duration `yaml:"request_delay" env-default:"1s"`
	MaxRedirects int           `yaml:"max_redirects" env-default:"5"`
}

type DLQConfig struct {
	Enabled    bool          `yaml:"enabled" env:"DLQ_ENABLED" env-default:"true"`
	MaxRetries int           `yaml:"max_retries" env:"DLQ_MAX_RETRIES" env-default:"3"`
	RetryDelay time.Duration `yaml:"retry_delay" env:"DLQ_RETRY_DELAY" env-default:"10s"`
	NumWorkers int           `yaml:"num_workers" env:"DLQ_NUM_WORKERS" env-default:"2"`
}