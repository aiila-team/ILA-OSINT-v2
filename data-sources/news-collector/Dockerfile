# =========================================================================
# Stage 1: Build the Golang application binary
# =========================================================================
FROM golang:1.26.4-alpine AS builder

# Install necessary build dependencies
RUN apk add --no-cache git ca-certificates

WORKDIR /app

# Copy dependency files and pre-fetch modules
COPY go.mod go.sum ./
RUN go mod download

# Copy application source code
COPY . .

# Compile the application as a statically linked binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /app/collector cmd/collector/main.go

# =========================================================================
# Stage 2: Final minimal runtime environment
# =========================================================================
FROM alpine:latest

# Install CA certificates to fetch HTTPS feeds and timezone data
RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

# Copy the compiled binary from the builder stage
COPY --from=builder /app/collector /app/collector

# Copy application configurations into expected directories
COPY --from=builder /app/configs /app/configs

# Expose Prometheus HTTP metrics endpoint port
EXPOSE 2112

# Run the News Collector application
ENTRYPOINT ["/app/collector"]
