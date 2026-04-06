#!/bin/sh
set -e

echo "Running database setup and seed..."
python -m modules.seed

echo "Starting backend server..."
exec uvicorn app:app --host 0.0.0.0 --port 8000
