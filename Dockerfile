# ─────────────────────────────────────────────────────────────────────
# Dockerfile — Renostter CRM (Sprint 22 — Fase 0)
#
# Multi-stage build para imagem final pequena (~150MB)
# Node 20 Alpine, non-root user, healthcheck
# ─────────────────────────────────────────────────────────────────────

# ── Stage 1: deps ──
FROM node:20-alpine AS deps

# Deps de sistema para módulos nativos (sqlite3, pg, bcryptjs)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    openssl \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    musl-dev \
    giflib-dev \
    librsvg-dev

WORKDIR /app

# Copia apenas package.json primeiro (cache de camadas Docker)
COPY cora-api/package.json cora-api/package-lock.json* ./cora-api/
WORKDIR /app/cora-api
RUN npm ci --only=production --no-audit --no-fund

# ── Stage 2: runner ──
FROM node:20-alpine AS runner

# Labels
LABEL maintainer="Renostter CRM <contato@renostter.com.br>"
LABEL version="1.0.0"
LABEL description="Renostter CRM/ERP - Middleware de Cobrança"

# Deps de runtime (sem compiladores)
RUN apk add --no-cache \
    openssl \
    cairo \
    jpeg \
    pango \
    musl \
    giflib \
    librsvg \
    tini \
    curl \
    tzdata

# Timezone
ENV TZ=America/Sao_Paulo
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Cria usuário não-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S renostter -u 1001 -G nodejs

WORKDIR /app

# Copia node_modules do stage anterior
COPY --from=deps --chown=renostter:nodejs /app/cora-api/node_modules ./node_modules

# Copia código-fonte
COPY --chown=renostter:nodejs cora-api/ ./

# Volumes para persistência
RUN mkdir -p /app/uploads /app/backups /app/logs && \
    chown -R renostter:nodejs /app/uploads /app/backups /app/logs

USER renostter

ENV NODE_ENV=production
ENV PORT=3000
ENV NODE_OPTIONS="--max-old-space-size=512"

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# tini para signal handling correto (PID 1)
ENTRYPOINT ["/sbin/tini", "--"]

CMD ["node", "server.js"]
