# start_services.ps1
# Script to run tests, start Kafka consumer, or launch Celery workers on Windows.

param (
    [Parameter(Mandatory=$true)]
    [ValidateSet("tests", "consumer", "worker-fast", "worker-ml", "all-workers")]
    [string]$Action
)

$VENV_BIN = ".venv\Scripts"
$PYTHON = "$VENV_BIN\python.exe"
$CELERY = "$VENV_BIN\celery.exe"

# Check virtual environment
if (-not (Test-Path $PYTHON)) {
    Write-Error "Virtual environment not found at .venv. Please construct and install dependencies first."
    exit 1
}

switch ($Action) {
    "tests" {
        Write-Host "Running unit and integration tests..." -ForegroundColor Cyan
        & $PYTHON -m unittest discover -s tests -p "test_*.py" -v
    }
    "consumer" {
        Write-Host "Launching async Kafka Consumer Service..." -ForegroundColor Cyan
        & $PYTHON cmd/consumer.py
    }
    "worker-fast" {
        Write-Host "Starting Celery worker for queue: ner-fast (Solo Pool)..." -ForegroundColor Cyan
        & $CELERY -A app.celery_app worker --loglevel=INFO -Q ner-fast -P solo -n worker_fast@%h
    }
    "worker-ml" {
        Write-Host "Starting Celery worker for queue: ner-ml (Solo Pool)..." -ForegroundColor Cyan
        & $CELERY -A app.celery_app worker --loglevel=INFO -Q ner-ml -P solo -n worker_ml@%h
    }
    "all-workers" {
        Write-Host "Please start fast and ML workers in separate terminal windows using:" -ForegroundColor Yellow
        Write-Host "  powershell .\scripts\start_services.ps1 -Action worker-fast" -ForegroundColor Cyan
        Write-Host "  powershell .\scripts\start_services.ps1 -Action worker-ml" -ForegroundColor Cyan
    }
}
