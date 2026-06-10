package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/MythreshMukkara/new-collector/internal/collector/api"
	"github.com/MythreshMukkara/new-collector/internal/collector/dlq"
	"github.com/MythreshMukkara/new-collector/internal/collector/rss"
	"github.com/MythreshMukkara/new-collector/internal/collector/scraper"
	"github.com/MythreshMukkara/new-collector/internal/collector/workerpool"
	"github.com/MythreshMukkara/new-collector/internal/config"
	"github.com/MythreshMukkara/new-collector/internal/kafka"
	"github.com/MythreshMukkara/new-collector/internal/logger"
	"github.com/MythreshMukkara/new-collector/internal/normalizer"
	"github.com/joho/godotenv"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func main() {
	log := logger.New()

	// Load .env file if it exists
	if err := godotenv.Load(); err != nil {
		log.Info("no .env file found or failed to load it; relying on system environment variables")
	}

	// 1. Load configuration
	cfg, err := config.Load("configs/config.yaml")
	if err != nil {
		log.Error("failed to load system config", slog.String("error", err.Error()))
		os.Exit(1)
	}

	log.Info("system configuration loaded",
		slog.String("app", cfg.App.Name),
		slog.String("env", cfg.App.Environment),
	)

	// 2. Load collector feed sources
	feeds, err := config.LoadFeeds(cfg.FeedsPath)
	if err != nil {
		log.Error("failed to load feeds configuration",
			slog.String("path", cfg.FeedsPath),
			slog.String("error", err.Error()),
		)
		os.Exit(1)
	}

	log.Info("loaded collector sources", slog.Int("count", len(feeds)))

	// 3. Initialize components
	producer, err := kafka.New(cfg.Kafka, log)
	if err != nil {
		log.Error("failed to initialize Kafka producer", slog.String("error", err.Error()))
		os.Exit(1)
	}
	defer producer.Close()

	norm := normalizer.New()
	collyScraper := scraper.New(cfg.Scraper)
	rssColl := rss.New(cfg.Scraper.Timeout)
	apiColl := api.New(cfg.Scraper.Timeout)
	scraperColl := scraper.NewCollector(cfg.Scraper.Timeout)

	// 4. Initialize Worker Pool
	pool := workerpool.New(cfg.WorkerPool, collyScraper, norm, producer, log)
	pool.RegisterStrategy(rssColl)
	pool.RegisterStrategy(apiColl)
	pool.RegisterStrategy(scraperColl)

	// 5. Setup context with cancellation for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start DLQ Consumer if enabled
	if cfg.DLQ.Enabled {
		dlqConsumer, err := dlq.NewConsumer(cfg, collyScraper, norm, producer, pool, log)
		if err != nil {
			log.Error("failed to initialize DLQ consumer", slog.String("error", err.Error()))
			os.Exit(1)
		}
		dlqConsumer.RegisterStrategy(rssColl)
		dlqConsumer.RegisterStrategy(apiColl)
		dlqConsumer.RegisterStrategy(scraperColl)

		go dlqConsumer.Start(ctx)
	}

	// 5. Expose Prometheus metrics endpoint
	metricsAddr := fmt.Sprintf(":%d", cfg.Metrics.Port)
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	srv := &http.Server{
		Addr:    metricsAddr,
		Handler: mux,
	}

	go func() {
		log.Info("starting Prometheus metrics server", slog.String("addr", metricsAddr))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error("metrics server failed", slog.String("error", err.Error()))
		}
	}()

	// Start worker pool
	pool.Start(ctx)

	// Feed scheduling ticker
	ticker := time.NewTicker(cfg.WorkerPool.PollInterval)
	defer ticker.Stop()

	// Proactively trigger initial collection cycle
	go func() {
		log.Info("scheduling initial collection cycle")
		for _, source := range feeds {
			pool.Submit(source)
		}
	}()

	// Signal handling for graceful termination
	shutdownChan := make(chan os.Signal, 1)
	signal.Notify(shutdownChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				log.Info("scheduling periodic collection cycle")
				for _, source := range feeds {
					if ctx.Err() != nil {
						return
					}
					pool.Submit(source)
				}
			}
		}
	}()

	// Block until a shutdown signal is received
	sig := <-shutdownChan
	log.Info("received shutdown signal", slog.String("signal", sig.String()))

	// Cancel processing context to abort HTTP requests & scraping
	cancel()

	// Wait for pool workers to wrap up current runs and exit
	pool.Stop()

	// Shutdown the metrics HTTP server
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error("metrics server shutdown failed", slog.String("error", err.Error()))
	} else {
		log.Info("metrics server stopped cleanly")
	}

	log.Info("news collector engine shutdown successfully")
}