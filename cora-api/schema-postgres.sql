-- ============================================================================
-- Renostter CRM — Schema Postgres (Supabase / RDS / Neon)
-- ============================================================================
--
-- Como usar:
--   1. Crie um projeto no Supabase (https://supabase.com)
--   2. No painel, vá em SQL Editor → New query
--   3. Cole TODO este conteúdo e clique em "Run"
--   4. Após sucesso, copie a DATABASE_URL (Settings → Database → Connection string)
--   5. Cole no .env do cora-api: DATABASE_URL=postgres://...
--   6. Reinicie o backend (já detecta via DB_DRIVER=postgres)
--
-- Idempotente: pode rodar várias vezes sem erro.
-- ============================================================================

-- Extensões úteis
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Enum de status de cobrança
DO $$ BEGIN
    CREATE TYPE cobranca_status AS ENUM (
        'PENDING', 'OPEN', 'PAID', 'OVERDUE', 'CANCELLED'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enum de status de fatura
DO $$ BEGIN
    CREATE TYPE fatura_status AS ENUM (
        'AGUARDANDO_AUTORIZACAO', 'APROVADA', 'REPROVADA', 'CANCELADA'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enum de status de approval
DO $$ BEGIN
    CREATE TYPE approval_status AS ENUM (
        'PENDING', 'ESCALATED', 'APPROVED', 'REJECTED', 'EXPIRED'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enum de tier de aprovação
DO $$ BEGIN
    CREATE TYPE approval_tier AS ENUM (
        'admin', 'superadmin', 'compliance'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- TABELAS
-- ============================================================================

-- Bancos: referência BACEN
CREATE TABLE IF NOT EXISTS bancos_referencia (
    id SERIAL PRIMARY KEY,
    ispb TEXT NOT NULL UNIQUE,
    nome_reduzido TEXT,
    codigo_comp TEXT,
    nome_extenso TEXT,
    suporte_cobranca SMALLINT DEFAULT 0,
    url_website TEXT,
    ativo SMALLINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bancos_ref_codigo ON bancos_referencia(codigo_comp);
CREATE INDEX IF NOT EXISTS idx_bancos_ref_nome ON bancos_referencia(nome_reduzido);

-- Bancos cadastrados no sistema (credenciais + gateway)
-- Colunas alinhadas com SQLite (17/07/2026)
CREATE TABLE IF NOT EXISTS bancos_cadastrados (
    id SERIAL PRIMARY KEY,
    banco_referencia_id INTEGER REFERENCES bancos_referencia(id) ON DELETE SET NULL,
    nome_exibicao TEXT NOT NULL,
    codigo_comp TEXT,
    ispb TEXT,
    ambiente TEXT NOT NULL DEFAULT 'stage',
    base_url TEXT,
    client_id TEXT,
    client_secret_encrypted TEXT,
    cert_path TEXT,
    key_path TEXT,
    webhook_url TEXT,
    webhook_secret_encrypted TEXT,
    is_primary SMALLINT DEFAULT 0,
    ativo SMALLINT DEFAULT 1,
    config_extra_json JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bancos_cad_ref ON bancos_cadastrados(banco_referencia_id);
CREATE INDEX IF NOT EXISTS idx_bancos_cad_primary ON bancos_cadastrados(is_primary, ativo);

-- Cobranças (tabela principal do fluxo)
CREATE TABLE IF NOT EXISTS cobrancas (
    id TEXT PRIMARY KEY,
    contract_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    gateway_provider TEXT NOT NULL DEFAULT 'cora',
    gateway_charge_id TEXT,
    gateway_invoice_id TEXT,
    valor NUMERIC(12, 2) NOT NULL,
    data_vencimento DATE NOT NULL,
    data_pagamento TIMESTAMP,
    status cobranca_status NOT NULL DEFAULT 'PENDING',
    metodo_pagamento TEXT,
    barcode TEXT,
    linha_digitavel TEXT,
    pix_qrcode TEXT,
    pdf_url TEXT,
    idempotency_key TEXT,
    notif_email SMALLINT DEFAULT 0,
    notif_sms SMALLINT DEFAULT 0,
    notif_whatsapp SMALLINT DEFAULT 0,
    ultima_notif_em TIMESTAMP,
    juros_percentual NUMERIC(5, 2),
    multa_percentual NUMERIC(5, 2),
    desconto_valor NUMERIC(12, 2),
    desconto_valido_ate DATE,
    observacoes TEXT,
    emitido_por TEXT,
    cancelado_por TEXT,
    mock SMALLINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fatura_id TEXT,
    chamado_id_meta TEXT
);
CREATE INDEX IF NOT EXISTS idx_cobrancas_contract ON cobrancas(contract_id);
CREATE INDEX IF NOT EXISTS idx_cobrancas_client ON cobrancas(client_id);
CREATE INDEX IF NOT EXISTS idx_cobrancas_status ON cobrancas(status);
CREATE INDEX IF NOT EXISTS idx_cobrancas_vencimento ON cobrancas(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_cobrancas_gateway ON cobrancas(gateway_charge_id);
CREATE INDEX IF NOT EXISTS idx_cobrancas_created ON cobrancas(created_at);

-- Faturas (propostas de faturamento vinculadas a chamados)
CREATE TABLE IF NOT EXISTS faturas (
    id TEXT PRIMARY KEY,
    chamado_id TEXT,
    cliente_id TEXT,
    numero_fatura TEXT UNIQUE,
    valor_total NUMERIC(12, 2) NOT NULL,
    status fatura_status NOT NULL DEFAULT 'AGUARDANDO_AUTORIZACAO',
    data_aprovacao TIMESTAMP,
    data_reprovacao TIMESTAMP,
    data_emissao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    justificativa_reprovacao TEXT,
    cobranca_id TEXT,
    emitido_por TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS itens_fatura (
    id SERIAL PRIMARY KEY,
    fatura_id TEXT NOT NULL REFERENCES faturas(id) ON DELETE CASCADE,
    descricao TEXT,
    quantidade NUMERIC(10, 2),
    valor_unitario NUMERIC(12, 2),
    valor_total NUMERIC(12, 2),
    tipo TEXT DEFAULT 'peca',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Recorrência (substitui cora_recorrencia)
CREATE TABLE IF NOT EXISTS cobrancas_recorrentes (
    id SERIAL PRIMARY KEY,
    contract_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    gateway_provider TEXT NOT NULL DEFAULT 'cora',
    valor NUMERIC(12, 2) NOT NULL,
    frequency TEXT NOT NULL DEFAULT 'monthly',
    next_due_date DATE NOT NULL,
    last_emission_date DATE,
    active SMALLINT NOT NULL DEFAULT 1,
    customer_payload JSONB,
    services JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_recorrentes_next ON cobrancas_recorrentes(active, next_due_date);

-- Webhooks recebidos
CREATE TABLE IF NOT EXISTS webhooks_recebidos (
    id SERIAL PRIMARY KEY,
    provider TEXT,
    event_type TEXT,
    gateway_charge_id TEXT,
    cobranca_id TEXT,
    http_status INTEGER,
    raw_payload JSONB,
    processed TEXT DEFAULT 'sim',
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_webhooks_charge ON webhooks_recebidos(gateway_charge_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_date ON webhooks_recebidos(received_at);

-- Logs de Integração Cora (HTTP outbound)
-- Nomes de colunas alinhados com SQLite (17/07/2026) pra garantir paridade 1:1
-- (em vez de endpoint/payload/response/status, usamos url/request_payload/response_payload/http_status)
CREATE TABLE IF NOT EXISTS logs_integracao_cora (
    id SERIAL PRIMARY KEY,
    provider TEXT,
    tipo TEXT,
    url TEXT,
    method TEXT,
    request_payload JSONB,
    response_payload JSONB,
    http_status INTEGER,
    idempotency_key TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tokens de Integração (cache OAuth de provedores)
CREATE TABLE IF NOT EXISTS tokens_integracao (
    id SERIAL PRIMARY KEY,
    provider TEXT NOT NULL,
    client_id TEXT NOT NULL,
    access_token TEXT NOT NULL,
    expires_at BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, client_id)
);

-- Logs de auditoria (ações de usuário)
CREATE TABLE IF NOT EXISTS logs_auditoria (
    id SERIAL PRIMARY KEY,
    user_id TEXT,
    user_name TEXT,
    acao TEXT NOT NULL,
    entidade TEXT,
    entidade_id TEXT,
    detalhes_json JSONB,
    detalhes_json_full JSONB,
    ip_address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_entidade ON logs_auditoria(entidade, entidade_id);
CREATE INDEX IF NOT EXISTS idx_audit_date ON logs_auditoria(created_at);

-- Configurações de integração (legado / compatibilidade)
-- Colunas alinhadas com SQLite (17/07/2026)
CREATE TABLE IF NOT EXISTS configuracoes_integracao (
    id SERIAL PRIMARY KEY,
    provider TEXT NOT NULL,
    ambiente TEXT NOT NULL,
    client_id TEXT,
    client_secret_encrypted TEXT,
    cert_path TEXT,
    key_path TEXT,
    webhook_secret TEXT,
    config_extra_json JSONB,
    ativo SMALLINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Logs HTTP brutos (legado)
CREATE TABLE IF NOT EXISTS cora_logs (
    id SERIAL PRIMARY KEY,
    type TEXT,
    direction TEXT,
    endpoint TEXT,
    contract_id TEXT,
    charge_id TEXT,
    http_status INTEGER,
    payload JSONB,
    response JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cora_logs_contract ON cora_logs(contract_id);

-- Logs de notificações (histórico de envio)
-- Nomes alinhados com SQLite (17/07/2026): channel/recipient/message em vez de canal/destinatario/mensagem
CREATE TABLE IF NOT EXISTS logs_notificacoes (
    id SERIAL PRIMARY KEY,
    cobranca_id TEXT,
    channel TEXT,
    type TEXT,
    recipient TEXT,
    message TEXT,
    error_message TEXT,
    status TEXT,
    provider_response JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notif_cobranca ON logs_notificacoes(cobranca_id);

-- Pending Approvals (fila de aprovação financeira)
CREATE TABLE IF NOT EXISTS pending_approvals (
    id TEXT PRIMARY KEY,
    ticket_id TEXT,
    client_id TEXT,
    invoice_id TEXT,
    requested_by TEXT,
    request_value NUMERIC(12, 2),
    original_value NUMERIC(12, 2),
    requires_approval_reason TEXT,
    new_value NUMERIC(12, 2),
    decided_by TEXT,
    decision_type TEXT,
    decision_reason TEXT,
    tier approval_tier,
    status approval_status,
    decided_at TIMESTAMP,
    deadline_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pa_status ON pending_approvals(status, created_at);
CREATE INDEX IF NOT EXISTS idx_pa_client ON pending_approvals(client_id);
CREATE INDEX IF NOT EXISTS idx_pa_tier ON pending_approvals(tier, status);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Função genérica de updated_at
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplica em todas as tabelas que têm updated_at
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['cobrancas','faturas','bancos_cadastrados','pending_approvals','cobrancas_recorrentes']
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trg_%I_updated ON %I;
            CREATE TRIGGER trg_%I_updated
                BEFORE UPDATE ON %I
                FOR EACH ROW
                EXECUTE FUNCTION trg_set_updated_at();
        ', t, t, t, t);
    END LOOP;
END $$;

-- ============================================================================
-- POLÍTICA DE RETENÇÃO (opcional — descomente se quiser auto-cleanup)
-- ============================================================================
--
-- Apaga logs de integração HTTP com mais de 90 dias
-- CREATE OR REPLACE FUNCTION cleanup_old_logs() RETURNS void AS $$
-- BEGIN
--     DELETE FROM logs_integracao_cora WHERE created_at < NOW() - INTERVAL '90 days';
--     DELETE FROM cora_logs WHERE created_at < NOW() - INTERVAL '90 days';
--     DELETE FROM webhooks_recebidos WHERE received_at < NOW() - INTERVAL '180 days';
-- END;
-- $$ LANGUAGE plpgsql;
--
-- SELECT cron.schedule('cleanup-old-logs', '0 4 * * *', 'SELECT cleanup_old_logs()');
-- (requer extensão pg_cron habilitada no Supabase)

-- ============================================================================
-- GRANTS para o role padrão (Supabase cria `authenticated` e `service_role`)
-- ============================================================================
-- O app usa a connection string do service_role (full access)
-- Não precisa grants adicionais. Para acesso pelo frontend, criar RLS policies.
--
-- Exemplo de RLS (descomente se quiser separar frontend/backend):
-- ALTER TABLE cobrancas ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow read for authenticated" ON cobrancas
--   FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- FIM
-- ============================================================================
-- Total esperado: ~12 tabelas, ~20 índices, ~5 triggers
-- ============================================================================