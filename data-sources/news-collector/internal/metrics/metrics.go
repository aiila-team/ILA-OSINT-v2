package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// FeedsProcessedTotal tracks total RSS feed processing attempts.
	FeedsProcessedTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Namespace: "news",
			Subsystem: "collector",
			Name:      "feeds_processed_total",
			Help:      "The total number of processed RSS feeds labeled by publisher and status.",
		},
		[]string{"publisher", "status"},
	)

	// ArticlesProcessedTotal tracks total normalized and ingested articles.
	ArticlesProcessedTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Namespace: "news",
			Subsystem: "collector",
			Name:      "articles_processed_total",
			Help:      "The total number of normalized/published articles labeled by publisher and status.",
		},
		[]string{"publisher", "status"},
	)

	// ProcessingDuration tracks durations of different steps in the ingestion pipeline.
	ProcessingDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Namespace: "news",
			Subsystem: "collector",
			Name:      "processing_duration_seconds",
			Help:      "Duration of ingestion operations in seconds.",
			Buckets:   []float64{0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 15.0, 30.0},
		},
		[]string{"publisher", "step"},
	)

	// QueueLength reports current length of active work buffer channel.
	QueueLength = promauto.NewGauge(
		prometheus.GaugeOpts{
			Namespace: "news",
			Subsystem: "collector",
			Name:      "queue_length",
			Help:      "The current size of the worker pool task channel buffer.",
		},
	)

	// ActiveWorkers reports count of currently processing worker threads.
	ActiveWorkers = promauto.NewGauge(
		prometheus.GaugeOpts{
			Namespace: "news",
			Subsystem: "collector",
			Name:      "active_workers",
			Help:      "The current number of active worker goroutines in the pool.",
		},
	)
)
