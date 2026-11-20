#!/usr/bin/env bash
set -euo pipefail

# Daily PostgreSQL backup. Optionally uploads to S3-compatible storage.
# Usage: DATABASE_URL=... BACKUP_DIR=/var/backups/gridpost ./scripts/backup.sh
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/gridpost-$STAMP.sql.gz"
pg_dump "$DATABASE_URL" | gzip > "$FILE"
echo "backup written: $FILE"

find "$BACKUP_DIR" -name 'gridpost-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete

if [[ -n "${S3_BACKUP_URL:-}" ]]; then
  aws s3 cp "$FILE" "$S3_BACKUP_URL/" --endpoint-url "${S3_ENDPOINT:-}"
  echo "backup uploaded to $S3_BACKUP_URL"
fi
