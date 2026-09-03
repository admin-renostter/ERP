#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# backup.sh — Backup manual do Postgres (cifrado AES-256-GCM)
# ═══════════════════════════════════════════════════════════════════

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="./backups/postgres"
BACKUP_FILE="$BACKUP_DIR/renostter-$STAMP.sql.gz.enc"
KEY_FILE=".backup.key"

echo -e "${YELLOW}→ Criando backup cifrado...${NC}"
mkdir -p "$BACKUP_DIR"

# Pega senha de criptografia do env
if [ -z "$BACKUP_ENCRYPTION_KEY" ] && [ -f .env ]; then
    export BACKUP_ENCRYPTION_KEY=$(grep BACKUP_ENCRYPTION_KEY .env | cut -d= -f2)
fi

if [ -z "$BACKUP_ENCRYPTION_KEY" ]; then
    echo "❌ BACKUP_ENCRYPTION_KEY não definida no .env"
    exit 1
fi

# Dump
echo "   Dump do Postgres..."
docker compose exec -T postgres pg_dump -U renostter -d renostter_crm --no-owner --clean 2>/dev/null | gzip > /tmp/backup.sql.gz

# Cifra com AES-256-GCM
echo "   Cifrando com AES-256-GCM..."
KEY=$(echo -n "$BACKUP_ENCRYPTION_KEY" | sha256sum | cut -d' ' -f1)
IV=$(openssl rand -hex 12)
{
    echo -n "RENOSTTER1"  # magic
    echo -n "$IV"          # 12 bytes IV
    openssl enc -aes-256-gcm -salt -K "$KEY" -iv "$IV" \
        -in /tmp/backup.sql.gz -out /tmp/backup.sql.gz.enc 2>/dev/null
} > "$BACKUP_FILE"

rm /tmp/backup.sql.gz /tmp/backup.sql.gz.enc

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo -e "${GREEN}✓ Backup criado: $BACKUP_FILE ($SIZE)${NC}"

# Limpa backups antigos (>30 dias)
echo "   Limpando backups > 30 dias..."
find "$BACKUP_DIR" -name "*.enc" -mtime +30 -delete 2>/dev/null || true
REMAINING=$(ls "$BACKUP_DIR"/*.enc 2>/dev/null | wc -l)
echo "   Backups retidos: $REMAINING"

# Upload para S3 (opcional, se BACKUP_S3_BUCKET estiver configurado)
if [ -n "$BACKUP_S3_BUCKET" ] && [ -n "$BACKUP_S3_KEY_ID" ]; then
    echo "   Upload para S3..."
    export AWS_ACCESS_KEY_ID="$BACKUP_S3_KEY_ID"
    export AWS_SECRET_ACCESS_KEY="$BACKUP_S3_APP_KEY"
    aws s3 cp "$BACKUP_FILE" "s3://$BACKUP_S3_BUCKET/postgres/" \
        --endpoint-url "$BACKUP_S3_ENDPOINT" 2>/dev/null || echo "   (falha no upload S3, backup local OK)"
fi
