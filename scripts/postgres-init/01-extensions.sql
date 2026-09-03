-- ═══════════════════════════════════════════════════════════════════
-- Postgres init — Renostter CRM
-- Sprint 22 — Fase 0
--
-- Este arquivo roda automaticamente na primeira inicialização do
-- container Postgres (via /docker-entrypoint-initdb.d)
--
-- Cria extensões úteis + schema padrão.
-- O schema completo das tabelas é criado pela app em database.js
-- ═══════════════════════════════════════════════════════════════════

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- funções de criptografia
CREATE EXTENSION IF NOT EXISTS "citext";         -- case-insensitive text
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- fuzzy search / trigram
CREATE EXTENSION IF NOT EXISTS "btree_gin";      -- GIN index em tipos btree

-- Schema padrão (se quiser separar do 'public')
-- CREATE SCHEMA IF NOT EXISTS renostter;
-- SET search_path TO renostter, public;

-- Mensagem de confirmação
DO $$
BEGIN
    RAISE NOTICE 'Renostter CRM — Postgres init OK (extensões criadas)';
END $$;
