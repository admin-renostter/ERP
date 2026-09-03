/**
 * Database Layer — Módulo de Cobrança
 *
 * Suporta DOIS drivers via feature flag `DB_DRIVER`:
 *   - `sqlite` (default): arquivo local `cora.sqlite`, ideal para dev/single-server
 *   - `postgres`: Supabase/RDS/Neon, recomendado para produção multi-tenant
 *
 * A API pública (`dbRun`, `dbGet`, `dbAll`) é **idêntica** nos dois drivers.
 * O código de aplicação não precisa saber qual está ativo.
 *
 * Configuração via .env do cora-api:
 *   DB_DRIVER=sqlite                       # ou 'postgres'
 *   DATABASE_URL=postgres://user:pass@...  # obrigatório se DB_DRIVER=postgres
 *
 * Tabelas (criadas pelo initDb):
 *   cobrancas           — Cobranças emitidas (migração de cora_boletos)
 *   cobrancas_recorrentes — Controle de recorrência (migração de cora_recorrencia)
 *   webhooks_recebidos  — Eventos recebidos dos provedores
 *   logs_auditoria      — Ações de usuário (emitir, cancelar, etc.)
 *   configuracoes_integracao — Credenciais e configs por provedor
 *   cora_logs           — Logs legados de requisições HTTP (mantido por compatibilidade)
 *   pending_approvals   — Fila de aprovação financeira (admin/superadmin)
 *   bancos_referencia   — Catálogo BACEN
 *   bancos_cadastrados  — Credenciais de gateways configurados
 *   logs_notificacoes   — Histórico de envio de notificações
 *   faturas + itens_fatura — Faturas vinculadas a chamados
 *   tokens_integracao   — Cache de tokens OAuth de provedores
 */

const path = require('path');

const DB_DRIVER = (process.env.DB_DRIVER || 'sqlite').toLowerCase();

if (DB_DRIVER === 'postgres') {
    // ═══════════════════════════════════════
    // DRIVER: POSTGRES
    // ═══════════════════════════════════════
    console.log('[DB] Driver: POSTGRES');
    const pg = require('./db/postgres');
    module.exports = pg;
    // Schema é criado/mantido fora (Supabase Dashboard ou script init)
    console.log('[DB] ✅ Pool Postgres inicializado. Schema deve existir no banco (rode schema-postgres.sql).');
} else {
    // ═══════════════════════════════════════
    // DRIVER: SQLITE (default)
    // ═══════════════════════════════════════
    console.log('[DB] Driver: SQLITE');
    const sqlite3 = require('sqlite3').verbose();

    const dbPath = path.resolve(__dirname, 'cora.sqlite');
    const sqliteDb = new sqlite3.Database(dbPath, (err) => {
        if (err) console.error('[SQLite] Erro ao conectar:', err.message);
        else {
            console.log('[SQLite] Banco de dados conectado:', dbPath);
            applyPragmas();
            initDb();
        }
    });

    /**
     * [PERF] PRAGMAs otimizadores — aplicados ANTES de qualquer tabela existir.
     *
     *   journal_mode = WAL      → leituras não bloqueiam escritas
     *   synchronous = NORMAL    → tolera perda de 1 tx em crash (vs FULL); ~3x mais rápido
     *   busy_timeout = 5000     → espera 5s em vez de retornar SQLITE_BUSY em contenção
     *   foreign_keys = ON       → ativa constraints referenciais (off por padrão no SQLite)
     *   temp_store = MEMORY      → tabelas temporárias em RAM
     *   cache_size = -64000     → 64MB de cache negativo (interpretado como KB; 64*1024=64MB)
     *   mmap_size = 268435456   → 256MB memory-mapped I/O para leitura
     *
     * Trade-offs:
     *   - NORMAL (vs FULL): risco de corrupção de 1 transação em crash de OS/hardware.
     *     Em produção single-server é aceitável; em cluster NUNCA usar.
     *   - mmap: leak baixo de memória (~256MB virtual); em Windows às vezes é menor.
     */
    function applyPragmas() {
        const pragmas = [
            'PRAGMA journal_mode = WAL',
            'PRAGMA synchronous = NORMAL',
            'PRAGMA busy_timeout = 5000',
            'PRAGMA foreign_keys = ON',
            'PRAGMA temp_store = MEMORY',
            'PRAGMA cache_size = -64000',
            'PRAGMA mmap_size = 268435456'
        ];
        for (const sql of pragmas) {
            sqliteDb.run(sql, (err) => {
                if (err) console.warn(`[SQLite] PRAGMA falhou (${sql}):`, err.message);
            });
        }
        console.log('[SQLite] PRAGMAs aplicados: WAL + busy_timeout=5s + FK + mmap256M');
    }

    // Wrappers de compat — sqlite3 é callback-based; convertemos para Promise
    // para que dbRun/dbGet/dbAll tenham a mesma forma que no Postgres driver.
    function dbRun(sql, params = []) {
        return new Promise((resolve, reject) => {
            sqliteDb.run(sql, params, function (err) {
                if (err) return reject(err);
                resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }
    function dbGet(sql, params = []) {
        return new Promise((resolve, reject) => {
            sqliteDb.get(sql, params, (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });
    }
    function dbAll(sql, params = []) {
        return new Promise((resolve, reject) => {
            sqliteDb.all(sql, params, (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    }
    function close() {
        return new Promise((resolve) => sqliteDb.close(resolve));
    }

    /**
     * initDb() — Cria tabelas, índices, triggers e migrações de compatibilidade.
     *
     * IMPORTANTE: Este bloco só roda quando DB_DRIVER=sqlite. No modo postgres,
     * o schema é gerenciado externamente (via schema-postgres.sql no Supabase).
     */
    function initDb() {
        // Re-aplica PRAGMAs (idempotente; alguns clientes resetam)
        sqliteDb.run('PRAGMA foreign_keys = ON');
        sqliteDb.run('PRAGMA journal_mode = WAL');

        sqliteDb.serialize(() => {
            // ═══════════════════════════════════════
            // Módulo de Bancos: Referência e Cadastro
            // ═══════════════════════════════════════
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS bancos_referencia (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ispb TEXT NOT NULL,
                nome_reduzido TEXT,
                codigo_comp TEXT,
                nome_extenso TEXT,
                suporte_cobranca INTEGER DEFAULT 0,
                url_website TEXT,
                ativo INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            sqliteDb.run(`CREATE TABLE IF NOT EXISTS bancos_cadastrados (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                banco_referencia_id INTEGER,
                nome_exibicao TEXT NOT NULL,
                ambiente TEXT NOT NULL DEFAULT 'stage',
                base_url TEXT,
                client_id TEXT,
                client_secret_encrypted TEXT,
                cert_path TEXT,
                key_path TEXT,
                webhook_url TEXT,
                webhook_secret_encrypted TEXT,
                is_primary INTEGER DEFAULT 0,
                ativo INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (banco_referencia_id) REFERENCES bancos_referencia(id) ON DELETE SET NULL
            )`);

            sqliteDb.run(`CREATE TABLE IF NOT EXISTS logs_integracao_bancaria (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                banco_id INTEGER,
                evento TEXT,
                payload TEXT,
                status TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // ═══════════════════════════════════════
            // Cobranças (substitui cora_boletos)
            // ═══════════════════════════════════════
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS cobrancas (
                id TEXT PRIMARY KEY,
                contract_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                gateway_provider TEXT NOT NULL DEFAULT 'cora',
                gateway_charge_id TEXT,
                gateway_invoice_id TEXT,
                valor REAL NOT NULL,
                data_vencimento TEXT NOT NULL,
                data_pagamento TEXT,
                status TEXT NOT NULL DEFAULT 'PENDING',
                metodo_pagamento TEXT,
                barcode TEXT,
                linha_digitavel TEXT,
                pix_qrcode TEXT,
                pdf_url TEXT,
                idempotency_key TEXT,
                notif_email INTEGER DEFAULT 0,
                notif_sms INTEGER DEFAULT 0,
                notif_whatsapp INTEGER DEFAULT 0,
                ultima_notif_em TEXT,
                juros_percentual REAL,
                multa_percentual REAL,
                desconto_valor REAL,
                desconto_valido_ate TEXT,
                observacoes TEXT,
                emitido_por TEXT,
                cancelado_por TEXT,
                mock INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                fatura_id TEXT,
                chamado_id_meta TEXT
            )`);

            // Faturas vinculadas a chamados
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS faturas (
                id TEXT PRIMARY KEY,
                chamado_id TEXT,
                cliente_id TEXT,
                numero_fatura TEXT UNIQUE,
                valor_total REAL NOT NULL,
                status TEXT NOT NULL DEFAULT 'AGUARDANDO_AUTORIZACAO',
                data_aprovacao TEXT,
                data_reprovacao TEXT,
                justificativa_reprovacao TEXT,
                cobranca_id TEXT,
                emitido_por TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            sqliteDb.run(`CREATE TABLE IF NOT EXISTS itens_fatura (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fatura_id TEXT NOT NULL,
                descricao TEXT,
                quantidade REAL,
                valor_unitario REAL,
                valor_total REAL,
                tipo TEXT DEFAULT 'peca',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (fatura_id) REFERENCES faturas(id) ON DELETE CASCADE
            )`);

            // Recorrência (substitui cora_recorrencia)
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS cobrancas_recorrentes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contract_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                gateway_provider TEXT NOT NULL DEFAULT 'cora',
                valor REAL NOT NULL,
                frequency TEXT NOT NULL DEFAULT 'monthly',
                next_due_date TEXT NOT NULL,
                last_emission_date TEXT,
                active INTEGER NOT NULL DEFAULT 1,
                customer_payload TEXT,
                services TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Webhooks recebidos
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS webhooks_recebidos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT,
                event_type TEXT,
                gateway_charge_id TEXT,
                http_status INTEGER,
                raw_payload TEXT,
                processed TEXT DEFAULT 'sim',
                received_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Logs de Integração Cora (Auditoria HTTP outbound)
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS logs_integracao_cora (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT,
                tipo TEXT,
                endpoint TEXT,
                payload TEXT,
                response TEXT,
                status INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Tokens de Integração (Cache seguro de sessão APIs)
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS tokens_integracao (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT NOT NULL,
                client_id TEXT NOT NULL,
                access_token TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(provider, client_id)
            )`);

            // Logs de auditoria (ações de usuário)
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS logs_auditoria (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                user_name TEXT,
                acao TEXT NOT NULL,
                entidade TEXT,
                entidade_id TEXT,
                detalhes_json TEXT,
                detalhes_json_full TEXT,
                ip_address TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // ── Sprint Security Hardening 2 (V09): JWT revocation blacklist ──
            // Armazena tokens revogados antes da expiração natural (logout, password reset, etc.)
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS jwt_revoked (
                jti TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                expires_at DATETIME NOT NULL,
                revoked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                reason TEXT,
                revoked_by TEXT
            )`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_jwt_revoked_user ON jwt_revoked(user_id)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_jwt_revoked_expires ON jwt_revoked(expires_at)`);

            // ── Sprint Security Hardening 3 (V21): Security events log ──
            // Eventos estruturados de segurança (login, brute force, etc)
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS security_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                event_type TEXT NOT NULL,
                severity TEXT NOT NULL,
                user_id TEXT,
                user_email TEXT,
                ip TEXT,
                user_agent TEXT,
                path TEXT,
                method TEXT,
                details_json TEXT
            )`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_se_event_type ON security_events(event_type)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_se_user_id ON security_events(user_id)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_se_ip ON security_events(ip)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_se_timestamp ON security_events(timestamp)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_se_severity ON security_events(severity)`);

            // ════════════════════════════════════════════════════════════════
            // MÓDULOS FINANCEIROS (baseados nas 9 planilhas Cora)
            // ════════════════════════════════════════════════════════════════

            // 1. FLUXO DE CAIXA (semanal / mensal / semestral)
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS fin_fluxo_caixa (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo TEXT NOT NULL,                  -- 'entrada' | 'saida'
                categoria TEXT NOT NULL,             -- 'fornecedores', 'folha', 'vendas', etc
                descricao TEXT,
                valor REAL NOT NULL,
                data DATE NOT NULL,
                data_realizado DATE,
                status TEXT DEFAULT 'previsto',      -- 'previsto' | 'realizado' | 'atrasado'
                periodo TEXT,                        -- 'semanal' | 'mensal' | 'semestral'
                cliente_id TEXT,
                fornecedor TEXT,
                tenant_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_fc_data ON fin_fluxo_caixa(data)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_fc_tipo ON fin_fluxo_caixa(tipo)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_fc_status ON fin_fluxo_caixa(status)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_fc_periodo ON fin_fluxo_caixa(periodo)`);

            // 2. CUSTO DE PRODUÇÃO (matérias-primas, embalagens, produtos)
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS fin_custo_producao (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                produto TEXT NOT NULL,
                periodo TEXT NOT NULL,              -- 'YYYY-MM'
                materia_prima REAL DEFAULT 0,
                embalagem REAL DEFAULT 0,
                mao_de_obra REAL DEFAULT 0,
                outros_custos REAL DEFAULT 0,
                custo_total REAL NOT NULL,         -- gerado por soma
                saldo_inicial REAL DEFAULT 0,
                saldo_final REAL DEFAULT 0,        -- saldo_inicial + compras - vendas
                tenant_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_cp_produto ON fin_custo_producao(produto)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_cp_periodo ON fin_custo_producao(periodo)`);

            // 3. CONCILIAÇÃO BANCÁRIA (extrato vs balancete)
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS fin_conciliacao (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                data DATE NOT NULL,
                descricao TEXT,
                forma_pagamento TEXT,                -- 'pix' | 'boleto' | 'credito' | 'debito' | 'dinheiro'
                origem TEXT,                          -- conta de origem
                destino TEXT,                         -- conta de destino
                valor REAL NOT NULL,
                origem_tipo TEXT NOT NULL,           -- 'interno' | 'extrato'
                conciliado INTEGER DEFAULT 0,        -- 0=pendente, 1=conciliado
                banco_id INTEGER,
                categoria TEXT,
                tenant_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_conc_data ON fin_conciliacao(data)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_conc_origem_tipo ON fin_conciliacao(origem_tipo)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_conc_conciliado ON fin_conciliacao(conciliado)`);

            // 4. PRECIFICAÇÃO (despesas fixas, variáveis, markup)
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS fin_precificacao (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo TEXT NOT NULL,                  -- 'fixa' | 'variavel'
                categoria TEXT NOT NULL,             -- 'aluguel', 'energia', etc
                descricao TEXT,
                valor REAL NOT NULL DEFAULT 0,
                competencia_mes TEXT,                -- 'YYYY-MM'
                ativo INTEGER DEFAULT 1,
                tenant_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_prec_tipo ON fin_precificacao(tipo)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_prec_competencia ON fin_precificacao(competencia_mes)`);

            // 5. CONTAS A PAGAR E RECEBER
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS fin_contas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo TEXT NOT NULL,                  -- 'pagar' | 'receber'
                descricao TEXT NOT NULL,
                cliente_id TEXT,
                fornecedor TEXT,
                valor_inicial REAL NOT NULL,
                valor_final REAL,                    -- valor_inicial + juros
                juros_por_dia REAL DEFAULT 0,
                dias_atraso INTEGER DEFAULT 0,
                data_vencimento DATE NOT NULL,
                data_pagamento DATE,
                status TEXT DEFAULT 'aberto',         -- 'aberto' | 'pago' | 'atrasado' | 'cancelado'
                categoria TEXT,
                tenant_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_contas_tipo ON fin_contas(tipo)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_contas_status ON fin_contas(status)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_contas_vencimento ON fin_contas(data_vencimento)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_contas_cliente ON fin_contas(cliente_id)`);

            // 6. CONTROLE DE INADIMPLÊNCIA
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS fin_inadimplencia (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cliente_id TEXT NOT NULL,
                conta_id INTEGER,                    -- FK para fin_contas
                valor_original REAL NOT NULL,
                valor_pago REAL DEFAULT 0,
                valor_juros REAL DEFAULT 0,
                valor_multa REAL DEFAULT 0,
                valor_total REAL NOT NULL,
                dias_atraso INTEGER DEFAULT 0,
                data_vencimento DATE NOT NULL,
                data_pagamento DATE,
                status TEXT DEFAULT 'em_aberto',       -- 'em_aberto' | 'negociando' | 'pago' | 'juridico' | 'cancelado'
                tentativas_cobranca INTEGER DEFAULT 0,
                ultima_cobranca DATE,
                observacoes TEXT,
                tenant_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_inad_cliente ON fin_inadimplencia(cliente_id)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_inad_status ON fin_inadimplencia(status)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_inad_dias ON fin_inadimplencia(dias_atraso)`);

            // 7. BALANÇO PATRIMONIAL (ativo/passivo trimestral)
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS fin_balanco (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo TEXT NOT NULL,                  -- 'ativo' | 'passivo'
                categoria TEXT NOT NULL,             -- 'circulante' | 'nao_circulante' | 'pleno'
                subcategoria TEXT,                   -- 'caixa', 'cheques', 'fornecedores', etc
                valor REAL NOT NULL DEFAULT 0,
                trimestre TEXT NOT NULL,            -- 'YYYY-Q1' | 'YYYY-Q2' | etc
                observacoes TEXT,
                tenant_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_bal_tipo ON fin_balanco(tipo)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_bal_trimestre ON fin_balanco(trimestre)`);

            // 8. ORÇAMENTO (precificação de serviços + mão de obra)
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS fin_orcamento (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                numero TEXT UNIQUE NOT NULL,
                cliente_id TEXT,
                titulo TEXT NOT NULL,
                descricao TEXT,
                tipo TEXT NOT NULL,                  -- 'servico' | 'manutencao' | 'instalacao' | 'pmoc'
                valor_custos_fixos REAL DEFAULT 0,
                valor_custos_variaveis REAL DEFAULT 0,
                valor_materiais REAL DEFAULT 0,
                valor_mao_de_obra REAL DEFAULT 0,
                margem_lucro_percent REAL DEFAULT 0,
                valor_total REAL NOT NULL,            -- custo + margem
                impostos_percent REAL DEFAULT 0,
                data_emissao DATE NOT NULL,
                data_validade DATE,
                status TEXT DEFAULT 'rascunho',       -- 'rascunho' | 'enviado' | 'aprovado' | 'rejeitado' | 'convertido'
                tenant_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_orc_cliente ON fin_orcamento(cliente_id)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_orc_status ON fin_orcamento(status)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_orc_numero ON fin_orcamento(numero)`);

            // Itens do orçamento
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS fin_orcamento_itens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                orcamento_id INTEGER NOT NULL,
                descricao TEXT NOT NULL,
                tipo TEXT,                            -- 'servico' | 'material'
                quantidade REAL DEFAULT 1,
                valor_unitario REAL NOT NULL,
                valor_total REAL NOT NULL,
                observacoes TEXT
            )`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_orc_itens ON fin_orcamento_itens(orcamento_id)`);

            // 9. CONTROLE FINANCEIRO EMPRESARIAL (DRE mensal)
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS fin_dre (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo TEXT NOT NULL,                  -- 'receita' | 'despesa'
                categoria TEXT NOT NULL,
                descricao TEXT,
                valor REAL NOT NULL,
                mes TEXT NOT NULL,                   -- 'YYYY-MM'
                data DATE NOT NULL,
                observacoes TEXT,
                tenant_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_dre_mes ON fin_dre(mes)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_dre_tipo ON fin_dre(tipo)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_dre_data ON fin_dre(data)`);

            // Configurações de integração por provedor (mantido para compat)
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS configuracoes_integracao (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT NOT NULL,
                ambiente TEXT NOT NULL,
                client_id TEXT,
                client_secret_encrypted TEXT,
                ativo INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            sqliteDb.run(`CREATE TABLE IF NOT EXISTS cora_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT,
                direction TEXT,
                endpoint TEXT,
                contract_id TEXT,
                charge_id TEXT,
                http_status INTEGER,
                payload TEXT,
                response TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Logs de notificações
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS logs_notificacoes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cobranca_id TEXT,
                canal TEXT,
                destinatario TEXT,
                mensagem TEXT,
                status TEXT,
                provider_response TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // ═══════════════════════════════════════
            // PENDING APPROVALS (Fila de aprovação financeira)
            // ═══════════════════════════════════════
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS pending_approvals (
                id TEXT PRIMARY KEY,
                ticket_id TEXT,
                client_id TEXT,
                requested_by TEXT,
                request_value REAL,
                original_value REAL,
                requires_approval_reason TEXT,
                new_value REAL,
                decided_by TEXT,
                decision_type TEXT,
                decision_reason TEXT,
                tier TEXT,
                status TEXT,
                decided_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // ═══════════════════════════════════════
            // MÓDULO DE CHAMADOS + GARANTIA
            // ═══════════════════════════════════════

            // ── Tabelas stub para FK (schema completo do ERP pode criar depois) ──
            // Sprint 0 — usuários agora têm: username, password (bcrypt), client_id,
            // token_version (para invalidação de refresh), twofa_secret (TOTP).
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS usuarios (
                id TEXT PRIMARY KEY,
                nome TEXT NOT NULL,
                username TEXT,
                email TEXT,
                password TEXT,
                role TEXT DEFAULT 'tecnico',
                client_id TEXT,
                photo TEXT,
                twofa_secret TEXT,
                twofa_enabled INTEGER DEFAULT 0,
                token_version INTEGER DEFAULT 0,
                password_changed_at DATETIME,
                last_login_at DATETIME,
                last_login_ip TEXT,
                failed_login_count INTEGER DEFAULT 0,
                locked_until DATETIME,
                ativo INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(email),
                UNIQUE(username)
            )`);
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS clientes (
                id TEXT PRIMARY KEY,
                nome TEXT NOT NULL,
                email TEXT,
                telefone TEXT,
                cnpj TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // ── Sprint 0 — migrations idempotentes para usuarios ──
            // Adiciona colunas em bancos antigos que já tinham a tabela
            // com o schema simplificado (id, nome, email, role, ativo, created_at).
            const _userColMigrations = [
                ['username',           "ALTER TABLE usuarios ADD COLUMN username TEXT"],
                ['password',           "ALTER TABLE usuarios ADD COLUMN password TEXT"],
                ['client_id',          "ALTER TABLE usuarios ADD COLUMN client_id TEXT"],
                ['photo',              "ALTER TABLE usuarios ADD COLUMN photo TEXT"],
                ['twofa_secret',       "ALTER TABLE usuarios ADD COLUMN twofa_secret TEXT"],
                ['twofa_enabled',      "ALTER TABLE usuarios ADD COLUMN twofa_enabled INTEGER DEFAULT 0"],
                ['token_version',      "ALTER TABLE usuarios ADD COLUMN token_version INTEGER DEFAULT 0"],
                ['password_changed_at',"ALTER TABLE usuarios ADD COLUMN password_changed_at DATETIME"],
                ['last_login_at',      "ALTER TABLE usuarios ADD COLUMN last_login_at DATETIME"],
                ['last_login_ip',      "ALTER TABLE usuarios ADD COLUMN last_login_ip TEXT"],
                ['failed_login_count', "ALTER TABLE usuarios ADD COLUMN failed_login_count INTEGER DEFAULT 0"],
                ['locked_until',       "ALTER TABLE usuarios ADD COLUMN locked_until DATETIME"],
                ['updated_at',         "ALTER TABLE usuarios ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP"],
            ];
            for (const [col, sql] of _userColMigrations) {
                sqliteDb.all(`PRAGMA table_info(usuarios)`, [], (err, rows) => {
                    if (err) return;
                    if (!rows.find(r => r.name === col)) {
                        sqliteDb.run(sql, (e) => {
                            if (e) console.warn(`[Migration] usuarios.${col}:`, e.message);
                            else console.log(`[Migration] usuarios.${col} adicionada.`);
                        });
                    }
                });
            }

            // Insere usuário e cliente de teste se não existirem
            sqliteDb.run(`INSERT OR IGNORE INTO usuarios (id, nome, role) VALUES ('tec-001', 'Técnico Teste', 'tecnico')`);
            sqliteDb.run(`INSERT OR IGNORE INTO clientes (id, nome) VALUES ('cli-teste-001', 'Cliente Teste')`);

            // ── Tabela de Chamados ──
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS chamados (
                id TEXT PRIMARY KEY,
                cliente_id TEXT NOT NULL,
                tecnico_id TEXT,
                titulo TEXT NOT NULL,
                descricao TEXT,
                categoria TEXT DEFAULT 'Manutenção Corretiva',
                prioridade TEXT DEFAULT 'Média',
                status TEXT DEFAULT 'Aberto',
                data_abertura DATETIME DEFAULT CURRENT_TIMESTAMP,
                data_conclusao DATETIME,
                data_garantia_fim DATETIME,
                dias_garantia INTEGER DEFAULT 90,
                motivo_reabertura TEXT,
                chamado_original_id TEXT,
                qtd_reaberturas INTEGER DEFAULT 0,
                observacoes_garantia TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
                FOREIGN KEY (tecnico_id) REFERENCES usuarios(id) ON DELETE SET NULL,
                FOREIGN KEY (chamado_original_id) REFERENCES chamados(id) ON DELETE SET NULL
            )`);

            // ── Logs de Garantia ──
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS logs_garantia (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chamado_id TEXT NOT NULL,
                usuario_id TEXT,
                usuario_nome TEXT,
                acao TEXT NOT NULL,
                motivo TEXT,
                detalhes TEXT,
                data_acao DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (chamado_id) REFERENCES chamados(id) ON DELETE CASCADE
            )`);

            // ── Configurações de Garantia ──
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS configuracoes_garantia (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL UNIQUE,
                valor TEXT NOT NULL,
                descricao TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Seed de configurações padrão (idempotente)
            const defaults = [
                ['dias_padrao_garantia', '90', 'Período padrão de garantia em dias corridos'],
                ['dias_alerta_reabertura', '7', 'Dias antes do vencimento para alertar'],
                ['max_reaberturas_garantia', '3', 'Número máximo de reaberturas em garantia'],
                ['permite_reabertura_apos_garantia', 'false', 'Se permite reabertura fora do prazo com justificativa'],
                ['status_reabertura', 'Reaberto', 'Status atribuído ao chamado reaberto'],
            ];
            const insertConfig = sqliteDb.prepare(
                `INSERT OR IGNORE INTO configuracoes_garantia (nome, valor, descricao) VALUES (?, ?, ?)`
            );
            for (const [nome, valor, desc] of defaults) {
                insertConfig.run(nome, valor, desc);
            }

            // ═══════════════════════════════════════
            // TRIGGERS
            // ═══════════════════════════════════════
            sqliteDb.run(`CREATE TRIGGER IF NOT EXISTS trg_pending_approvals_updated
                AFTER UPDATE ON pending_approvals
                BEGIN
                    UPDATE pending_approvals
                    SET updated_at = CURRENT_TIMESTAMP
                    WHERE id = NEW.id;
                END`);

            sqliteDb.run(`CREATE TRIGGER IF NOT EXISTS trg_cobrancas_updated
                AFTER UPDATE ON cobrancas
                BEGIN
                    UPDATE cobrancas
                    SET updated_at = CURRENT_TIMESTAMP
                    WHERE id = NEW.id;
                END`);

            sqliteDb.run(`CREATE TRIGGER IF NOT EXISTS trg_faturas_updated
                AFTER UPDATE ON faturas
                BEGIN
                    UPDATE faturas
                    SET updated_at = CURRENT_TIMESTAMP
                    WHERE id = NEW.id;
                END`);

            sqliteDb.run(`CREATE TRIGGER IF NOT EXISTS trg_bancos_cad_updated
                AFTER UPDATE ON bancos_cadastrados
                BEGIN
                    UPDATE bancos_cadastrados
                    SET updated_at = CURRENT_TIMESTAMP
                    WHERE id = NEW.id;
                END`);

            // Triggers de validação de status (defesa em profundidade)
            sqliteDb.run(`CREATE TRIGGER IF NOT EXISTS trg_cobrancas_status_insert
                BEFORE INSERT ON cobrancas
                WHEN NEW.status NOT IN ('PENDING', 'OPEN', 'PAID', 'OVERDUE', 'CANCELLED')
                BEGIN
                    SELECT RAISE(ABORT, 'Status inválido na inserção');
                END`);

            sqliteDb.run(`CREATE TRIGGER IF NOT EXISTS trg_cobrancas_status_update
                BEFORE UPDATE OF status ON cobrancas
                WHEN NEW.status NOT IN ('PENDING', 'OPEN', 'PAID', 'OVERDUE', 'CANCELLED')
                BEGIN
                    SELECT RAISE(ABORT, 'Status inválido na atualização');
                END`);

            // ═══════════════════════════════════════
            // ÍNDICES
            // ═══════════════════════════════════════
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_pa_status ON pending_approvals(status, created_at)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_pa_client ON pending_approvals(client_id)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_chamados_status ON chamados(status)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_chamados_cliente ON chamados(cliente_id)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_chamados_garantia_fim ON chamados(data_garantia_fim)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_chamados_original ON chamados(chamado_original_id)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_logs_garantia_chamado ON logs_garantia(chamado_id, data_acao)`);

            // Trigger de update automático em chamados
            sqliteDb.run(`CREATE TRIGGER IF NOT EXISTS trg_chamados_updated
                AFTER UPDATE ON chamados
                BEGIN
                    UPDATE chamados SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                END`);

            // ═══════════════════════════════════════
            // MÓDULO PMOC (Plano de Manutenção, Operação e Controle)
            // ABNT NBR 16020 — obrigatório para equipamentos ≥ 75k BTU/h
            // ═══════════════════════════════════════

            // ── Contratos (referência de equipamentos e cobranças) ──
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS contratos (
                id TEXT PRIMARY KEY,
                cliente_id TEXT,
                titulo TEXT,
                valor_mensal REAL,
                valor_anual REAL,
                frequencia_cobranca TEXT DEFAULT 'monthly',
                tipo_contrato TEXT DEFAULT 'empresarial',
                renovacao_automatica INTEGER DEFAULT 0,
                qtd_equipamentos_inclusos INTEGER DEFAULT 0,
                percentual_desconto REAL DEFAULT 0,
                sla_resposta_horas INTEGER DEFAULT 24,
                sla_resolucao_horas INTEGER DEFAULT 72,
                status TEXT DEFAULT 'Ativo',
                data_inicio TEXT,
                data_fim TEXT,
                created_by TEXT,
                observacoes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL
            )`);

            // ═══════════════════════════════════════════════════════════════
            // Sprint 13 — Multi-tenant (SaaS)
            // ═══════════════════════════════════════════════════════════════

            // Tabela de tenants (organizações/empresas no SaaS)
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS tenants (
                id TEXT PRIMARY KEY,
                slug TEXT UNIQUE NOT NULL,
                nome TEXT NOT NULL,
                documento TEXT,                  -- CNPJ/CPF
                email TEXT,
                telefone TEXT,
                plano TEXT DEFAULT 'trial',        -- trial | starter | pro | enterprise
                status TEXT DEFAULT 'ativo',       -- ativo | suspenso | cancelado | trial
                limite_usuarios INTEGER DEFAULT 5,
                limite_contratos INTEGER DEFAULT 50,
                limite_armazenamento_mb INTEGER DEFAULT 100,
                data_expiracao DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status, data_expiracao)`);

            // Relação N:N entre usuários e tenants (1 user pode acessar N tenants)
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS tenant_users (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                usuario_id TEXT NOT NULL,
                role TEXT DEFAULT 'user',         -- owner | admin | user | viewer
                ativo INTEGER DEFAULT 1,
                convidado_por TEXT,
                convidado_em DATETIME,
                aceito_em DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id, usuario_id),
                FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
            )`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_tenant_users_user ON tenant_users(usuario_id, ativo)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON tenant_users(tenant_id, ativo)`);

            // Convites pendentes
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS tenant_invites (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                email TEXT NOT NULL,
                role TEXT DEFAULT 'user',
                token TEXT UNIQUE NOT NULL,
                expira_em DATETIME NOT NULL,
                aceito_em DATETIME,
                convidado_por TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
            )`);

            // Tenant default (single-tenant legado vira "default")
            sqliteDb.run(`INSERT OR IGNORE INTO tenants (id, slug, nome, plano, status)
                         VALUES ('tnt_default', 'default', 'Renostter (Padrão)', 'enterprise', 'ativo')`);

            // ═══════════════════════════════════════════════════════════════
            // Sprint 17 — LGPD / Compliance
            // ═══════════════════════════════════════════════════════════════
            // Conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018)

            // Consentimentos: registra o consentimento explícito do titular
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS consentimentos (
                id TEXT PRIMARY KEY,
                cliente_id TEXT NOT NULL,
                tipo TEXT NOT NULL,                 -- 'marketing_email' | 'marketing_sms' | 'marketing_whatsapp' | 'compartilhamento_dados' | 'cookies' | 'newsletter'
                aceito INTEGER DEFAULT 0,            -- 0 = não, 1 = sim
                ip TEXT,
                user_agent TEXT,
                metodo_coleta TEXT,                  -- 'web_form' | 'api' | 'import' | 'contrato' | 'manual'
                detalhes TEXT,                        -- JSON com contexto (qual form, qual página)
                aceito_em DATETIME,
                revogado_em DATETIME,
                expira_em DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
            )`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_consent_cliente ON consentimentos(cliente_id, tipo)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_consent_tipo_aceito ON consentimentos(tipo, aceito)`);

            // DSAR: Data Subject Access Request (pedido de acesso/portabilidade/exclusão)
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS dsar_pedidos (
                id TEXT PRIMARY KEY,
                cliente_id TEXT NOT NULL,
                tipo TEXT NOT NULL,                   -- 'acesso' | 'portabilidade' | 'correcao' | 'exclusao' | 'oposicao'
                status TEXT DEFAULT 'pendente',       -- 'pendente' | 'em_analise' | 'concluido' | 'rejeitado' | 'expirado'
                descricao TEXT,                       -- Texto do titular
                prazo_legal DATETIME,                 -- Prazo legal (15 dias para LGPD)
                recebido_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                concluido_em DATETIME,
                atribuido_para TEXT,                  -- Quem está analisando
                resposta TEXT,                         -- Resposta enviada ao titular
                arquivo_export_url TEXT,              -- URL do arquivo gerado (portabilidade)
                ip TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
            )`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_dsar_cliente ON dsar_pedidos(cliente_id, status)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_dsar_status_prazo ON dsar_pedidos(status, prazo_legal)`);

            // Audit de acessos: registra quem viu dados pessoais sensíveis
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS audit_acessos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,                          -- Quem acessou
                user_role TEXT,
                cliente_id TEXT,                       -- Dados de quem foram acessados
                acao TEXT NOT NULL,                    -- 'read' | 'export' | 'update' | 'delete' | 'print' | 'download'
                entidade TEXT NOT NULL,                -- 'cliente' | 'cobranca' | 'chamado' | 'contrato' | 'portal_user'
                entidade_id TEXT,
                campos_acessados TEXT,                 -- JSON com lista de campos (se aplicável)
                ip TEXT,
                user_agent TEXT,
                motivo TEXT,                            -- Justificativa (se houver)
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_acessos(user_id, created_at DESC)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_audit_cliente ON audit_acessos(cliente_id, created_at DESC)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_audit_entidade ON audit_acessos(entidade, entidade_id)`);

            // Política de retenção: define quanto tempo guardar cada tipo de dado
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS politica_retencao (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entidade TEXT NOT NULL,                -- 'cobrancas' | 'chamados' | 'logs' | etc
                dias_retencao INTEGER NOT NULL,
                acao_pos_expiracao TEXT DEFAULT 'anonimizar',  -- 'deletar' | 'anonimizar' | 'manter'
                ativo INTEGER DEFAULT 1,
                descricao TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Seed das políticas padrão
            const retencaoDefaults = [
                ['cobrancas_pagas', 1825, 'manter', '5 anos (legislação fiscal)'],
                ['cobrancas_canceladas', 365, 'manter', '1 ano após cancelamento'],
                ['chamados_concluidos', 1825, 'manter', '5 anos (garantia + histórico)'],
                ['logs_auditoria', 1825, 'manter', '5 anos (compliance)'],
                ['audit_acessos', 1825, 'manter', '5 anos (LGPD art. 37)'],
                ['leads_nao_convertidos', 365, 'anonimizar', '1 ano sem conversão'],
                ['portal_sessions_expiradas', 90, 'deletar', '90 dias após expiração'],
                ['mobile_sync_log', 180, 'manter', '6 meses (analytics)'],
            ];
            const insertRetencao = sqliteDb.prepare(
                `INSERT OR IGNORE INTO politica_retencao (entidade, dias_retencao, acao_pos_expiracao, descricao) VALUES (?, ?, ?, ?)`
            );
            for (const [e, d, a, desc] of retencaoDefaults) insertRetencao.run(e, d, a, desc);

            // ═══════════════════════════════════════════════════════════════
            // Sprint 16 — Mobile API (técnicos em campo)
            // ═══════════════════════════════════════════════════════════════

            // Adiciona colunas version e deleted ao chamados (idempotente, callback-style)
            sqliteDb.all('PRAGMA table_info(chamados)', [], (err, cols) => {
                if (err) {
                    console.warn('[Sprint16] PRAGMA table_info(chamados) falhou:', err.message);
                    return;
                }
                const colNames = (cols || []).map(c => c.name);
                if (!colNames.includes('version')) {
                    sqliteDb.run('ALTER TABLE chamados ADD COLUMN version INTEGER DEFAULT 1');
                }
                if (!colNames.includes('deleted')) {
                    sqliteDb.run('ALTER TABLE chamados ADD COLUMN deleted INTEGER DEFAULT 0');
                }
            });

            // Chamado fotos: fotos anexadas a chamados via mobile

            // Chamado fotos: fotos anexadas a chamados via mobile
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS chamado_fotos (
                id TEXT PRIMARY KEY,
                chamado_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                mime_type TEXT,
                tamanho_bytes INTEGER,
                latitude REAL,
                longitude REAL,
                uploaded_by TEXT,
                uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                -- Sprint 16.6: versionamento para sync offline
                version INTEGER DEFAULT 1,
                deleted INTEGER DEFAULT 0,
                FOREIGN KEY (chamado_id) REFERENCES chamados(id) ON DELETE CASCADE
            )`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_chamado_fotos_chamado ON chamado_fotos(chamado_id, deleted)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_chamado_fotos_uploaded ON chamado_fotos(uploaded_at DESC)`);

            // Push tokens: dispositivos registrados para push notifications
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS push_tokens (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                token TEXT UNIQUE NOT NULL,
                platform TEXT NOT NULL,            -- 'ios' | 'android' | 'web'
                device_id TEXT,
                device_name TEXT,
                app_version TEXT,
                ativo INTEGER DEFAULT 1,
                ultimo_uso_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
            )`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id, ativo)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_push_tokens_token ON push_tokens(token)`);

            // Mobile sync log: registra cada sync do técnico (para auditoria + analytics)
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS mobile_sync_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                device_id TEXT,
                sync_type TEXT,                    -- 'full' | 'incremental' | 'push'
                tickets_received INTEGER DEFAULT 0,
                tickets_sent INTEGER DEFAULT 0,
                photos_sent INTEGER DEFAULT 0,
                location_points_sent INTEGER DEFAULT 0,
                duration_ms INTEGER,
                ip TEXT,
                user_agent TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
            )`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_sync_log_user ON mobile_sync_log(user_id, created_at DESC)`);

            // ═══════════════════════════════════════════════════════════════
            // Sprint 15 — Portal do Cliente (self-service)
            // ═══════════════════════════════════════════════════════════════
            // Tabelas para clientes finais acessarem contratos, cobranças
            // e chamados SEM precisar de conta admin.

            // Portal users: login próprio (separado de usuarios admin)
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS portal_users (
                id TEXT PRIMARY KEY,
                cliente_id TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                nome TEXT,
                telefone TEXT,
                ativo INTEGER DEFAULT 1,
                email_verificado INTEGER DEFAULT 0,
                ultimo_login_at DATETIME,
                ultimo_login_ip TEXT,
                password_reset_token TEXT,
                password_reset_expira_em DATETIME,
                failed_login_count INTEGER DEFAULT 0,
                locked_until DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
            )`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_portal_users_email ON portal_users(email)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_portal_users_cliente ON portal_users(cliente_id)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_portal_users_token ON portal_users(password_reset_token)`);

            // Portal sessions: tokens JWT podem ser revogados (blocklist)
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS portal_sessions (
                id TEXT PRIMARY KEY,
                portal_user_id TEXT NOT NULL,
                jti TEXT UNIQUE NOT NULL,        -- JWT ID
                ip TEXT,
                user_agent TEXT,
                expira_em DATETIME NOT NULL,
                revogada_em DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (portal_user_id) REFERENCES portal_users(id) ON DELETE CASCADE
            )`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_portal_sessions_user ON portal_sessions(portal_user_id)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_portal_sessions_jti ON portal_sessions(jti)`);

            // Portal notifications: mensagens enviadas ao cliente via portal
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS portal_notifications (
                id TEXT PRIMARY KEY,
                portal_user_id TEXT NOT NULL,
                tipo TEXT NOT NULL,             -- 'boleto' | 'vencimento' | 'chamado' | 'manutencao' | 'geral'
                titulo TEXT NOT NULL,
                mensagem TEXT,
                link TEXT,                       -- URL interna do portal para ação
                lida_em DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (portal_user_id) REFERENCES portal_users(id) ON DELETE CASCADE
            )`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_portal_notif_user ON portal_notifications(portal_user_id, lida_em)`);

            // ── Sprint 11: Templates de Contrato customizados ──
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS contract_templates (
                id TEXT PRIMARY KEY,
                slug TEXT UNIQUE NOT NULL,
                nome TEXT NOT NULL,
                descricao TEXT,
                categoria TEXT DEFAULT 'geral',
                tipo_contrato TEXT,
                html_content TEXT NOT NULL,
                css_content TEXT,
                variables_json TEXT,
                ativo INTEGER DEFAULT 1,
                versao INTEGER DEFAULT 1,
                created_by TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_templates_slug ON contract_templates(slug)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_templates_categoria ON contract_templates(categoria, ativo)`);

            // ── Sprint 21: Contratos gerados (rastreamento de envios ao Autentique) ──
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS contratos_gerados (
                id TEXT PRIMARY KEY,
                template_id TEXT,
                contrato_id TEXT,
                cliente_id TEXT,
                nome_documento TEXT NOT NULL,
                autentique_document_id TEXT,
                autentique_short_url TEXT,
                status TEXT DEFAULT 'pendente',
                signers_json TEXT,
                pdf_path TEXT,
                html_renderizado TEXT,
                erro TEXT,
                created_by TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                data_envio DATETIME,
                data_assinatura DATETIME,
                FOREIGN KEY (template_id) REFERENCES contract_templates(id) ON DELETE SET NULL,
                FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE SET NULL,
                FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL
            )`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_contratos_gerados_status ON contratos_gerados(status)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_contratos_gerados_cliente ON contratos_gerados(cliente_id)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_contratos_gerados_autentique ON contratos_gerados(autentique_document_id)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_contratos_gerados_contrato ON contratos_gerados(contrato_id)`);

            // ── Equipamentos (itens de climatização por cliente) ──
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS equipamentos (
                id TEXT PRIMARY KEY,
                cliente_id TEXT NOT NULL,
                contract_id TEXT,
                local_instalacao TEXT,
                marca TEXT,
                modelo TEXT,
                numero_serie TEXT,
                potencia_btu INTEGER,
                potencia_kw REAL,
                tipo_equipamento TEXT DEFAULT 'Split',
                refrigerante TEXT,
                regime_servico TEXT DEFAULT 'HVAC',
                data_instalacao TEXT,
                status_equipamento TEXT DEFAULT 'Operacional',
                observacoes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
                FOREIGN KEY (contract_id) REFERENCES contratos(id) ON DELETE SET NULL
            )`);

            // ── Manutenções Preventivas (agenda PMOC) ──
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS manutencoes_preventivas (
                id TEXT PRIMARY KEY,
                equipamento_id TEXT NOT NULL,
                tipo_manutencao TEXT NOT NULL,
                frequencia TEXT NOT NULL,
                proxima_data TEXT,
                ultima_data TEXT,
                tecnico_responsavel TEXT,
                status TEXT DEFAULT 'Pendente',
                observacoes TEXT,
                custo_mao_obra REAL,
                custo_pecas REAL,
                relatorio TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id) ON DELETE CASCADE
            )`);

            // ── Checklists PMOC (itens de inspeção por tipo de manutenção) ──
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS checklist_pmoc (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo_manutencao TEXT NOT NULL,
                item_ordem INTEGER DEFAULT 0,
                item_descricao TEXT NOT NULL,
                item_categoria TEXT,
                obrigatorio INTEGER DEFAULT 1,
                ativo INTEGER DEFAULT 1
            )`);

            // ── Registros de Checklist (execução real de cada manutenção) ──
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS checklist_registros (
                id TEXT PRIMARY KEY,
                manutencao_id TEXT NOT NULL,
                item_id INTEGER NOT NULL,
                resultado TEXT,
                observacao TEXT,
                foto_base64 TEXT,
                executado_por TEXT,
                executado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (manutencao_id) REFERENCES manutencoes_preventivas(id) ON DELETE CASCADE,
                FOREIGN KEY (item_id) REFERENCES checklist_pmoc(id) ON DELETE CASCADE
            )`);

            // ── Configurações PMOC ──
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS configuracoes_pmoc (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL UNIQUE,
                valor TEXT NOT NULL,
                descricao TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Seed de configuração padrão (idempotente)
            const pmocDefaults = [
                ['dias_alerta_vencimento', '30', 'Dias antes do vencimento PMOC para alertar'],
                ['obrigatorio_potencia_minima_btu', '75000', 'Potência mínima (BTU/h) para exigir PMOC'],
                ['frequencia_trimestral', '90', 'Dias entre manutenções trimestrais'],
                ['frequencia_semestral', '180', 'Dias entre manutenções semestrais'],
                ['frequencia_anual', '365', 'Dias entre manutenções anuais'],
                ['nome_responsavel_tecnico', '', 'Nome do RT (Responsável Técnico) padrão nos relatórios'],
                ['crea_responsavel', '', 'CREA do Responsável Técnico'],
            ];
            const insertPmocCfg = sqliteDb.prepare(
                `INSERT OR IGNORE INTO configuracoes_pmoc (nome, valor, descricao) VALUES (?, ?, ?)`
            );
            for (const [nome, valor, desc] of pmocDefaults) insertPmocCfg.run(nome, valor, desc);

            // Seed de checklist padrão (idempotente)
            const checkDefaults = [
                ['Trimestral', 1, 'Verificar temperatura de insuflamento', 'Temperatura', 1],
                ['Trimestral', 2, 'Medir pressão de sucção e descarga', 'Refrigeração', 1],
                ['Trimestral', 3, 'Verificar estado dos filtros de ar', 'Filtração', 1],
                ['Trimestral', 4, 'Inspecionar correias (se aplicável)', 'Mecânico', 1],
                ['Trimestral', 5, 'Limpar serpentina de evaporação', 'Limpeza', 1],
                ['Trimestral', 6, 'Verificar dreno de condensado', 'Água', 1],
                ['Trimestral', 7, 'Medir corrente elétrica do compressor', 'Elétrico', 1],
                ['Trimestral', 8, 'Verificar tensao de alimentação', 'Elétrico', 1],
                ['Trimestral', 9, 'Inspecionar isolamento térmico', 'Estrutural', 0],
                ['Trimestral', 10, 'Testar funcionamento do termostato', 'Controle', 1],
                ['Semestral', 1, 'Medir superaquecimento e subresfriamento', 'Refrigeração', 1],
                ['Semestral', 2, 'Verificar carga de refrigerante', 'Refrigeração', 1],
                ['Semestral', 3, 'Limpar serpentina de condensação', 'Limpeza', 1],
                ['Semestral', 4, 'Lubrificar motores (se aplicável)', 'Mecânico', 1],
                ['Semestral', 5, 'Calibrar termostato', 'Controle', 1],
                ['Anual', 1, 'Verificar integridade da estrutura', 'Estrutural', 1],
                ['Anual', 2, 'Inspecionar sistema elétrico completo', 'Elétrico', 1],
                ['Anual', 3, 'Teste de desempenho de refrigeração', 'Desempenho', 1],
                ['Anual', 4, 'Verificar compliance com ABNT NBR 16020', 'Legal', 1],
                ['Anual', 5, 'Emitir laudo técnico atualizado', 'Legal', 1],
            ];
            const insertCheck = sqliteDb.prepare(
                `INSERT OR IGNORE INTO checklist_pmoc (tipo_manutencao, item_ordem, item_descricao, item_categoria, obrigatorio)
                 VALUES (?, ?, ?, ?, ?)`
            );
            for (const [tipo, ordem, desc, cat, obr] of checkDefaults) insertCheck.run(tipo, ordem, desc, cat, obr);

            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_pa_tier ON pending_approvals(tier, status)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_equip_cliente ON equipamentos(cliente_id)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_equip_contract ON equipamentos(contract_id)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_equip_status ON equipamentos(status_equipamento)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_mp_equip ON manutencoes_preventivas(equipamento_id)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_mp_proxima ON manutencoes_preventivas(proxima_data, status)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_mp_tipo ON manutencoes_preventivas(tipo_manutencao)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_checklist_tipo ON checklist_pmoc(tipo_manutencao, ativo)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_registro_manut ON checklist_registros(manutencao_id)`);
            sqliteDb.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_bancos_ref_ispb ON bancos_referencia(ispb)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_bancos_ref_codigo ON bancos_referencia(codigo_comp)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_bancos_ref_nome ON bancos_referencia(nome_reduzido)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_bancos_cad_ref ON bancos_cadastrados(banco_referencia_id)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_bancos_cad_primary ON bancos_cadastrados(is_primary, ativo)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_cobrancas_contract ON cobrancas(contract_id)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_cobrancas_client ON cobrancas(client_id)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_cobrancas_status ON cobrancas(status)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_cobrancas_vencimento ON cobrancas(data_vencimento)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_cobrancas_gateway ON cobrancas(gateway_charge_id)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_cobrancas_created ON cobrancas(created_at)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_recorrentes_next ON cobrancas_recorrentes(active, next_due_date)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_webhooks_charge ON webhooks_recebidos(gateway_charge_id)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_webhooks_date ON webhooks_recebidos(received_at)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_audit_entidade ON logs_auditoria(entidade, entidade_id)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_audit_date ON logs_auditoria(created_at)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_notif_cobranca ON logs_notificacoes(cobranca_id)`);
            sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_cora_logs_contract ON cora_logs(contract_id)`);

            // ═══════════════════════════════════════
            // MIGRAÇÕES DE COMPATIBILIDADE
            // ═══════════════════════════════════════
            // Migração da tabela antiga `boletos` → `cobrancas`
            sqliteDb.get("SELECT name FROM sqlite_master WHERE type='table' AND name='boletos'", (err, row) => {
                if (err || !row) return;
                console.log('[SQLite] Detectada tabela legada `boletos` — migrando...');
                sqliteDb.run(`INSERT OR IGNORE INTO cobrancas
                    (id, contract_id, client_id, gateway_provider, gateway_charge_id,
                     valor, data_vencimento, status, created_at)
                    SELECT id, contract_id, client_id, 'cora', gateway_charge_id,
                           valor, data_vencimento,
                           CASE status
                               WHEN 'pendente' THEN 'PENDING'
                               WHEN 'pago' THEN 'PAID'
                               WHEN 'vencido' THEN 'OVERDUE'
                               WHEN 'cancelado' THEN 'CANCELLED'
                               ELSE 'PENDING'
                           END,
                           created_at
                    FROM boletos
                    WHERE id NOT IN (SELECT id FROM cobrancas)`,
                    (migErr) => {
                        if (migErr) console.warn('[SQLite] Migração boletos falhou:', migErr.message);
                        else console.log('[SQLite] Migração boletos → cobrancas concluída.');
                    });
            });

            // Migração da tabela antiga `cora_recorrencia` → `cobrancas_recorrentes`
            sqliteDb.get("SELECT name FROM sqlite_master WHERE type='table' AND name='cora_recorrencia'", (err, row) => {
                if (err || !row) return;
                console.log('[SQLite] Detectada tabela legada `cora_recorrencia` — migrando...');
                sqliteDb.run(`INSERT OR IGNORE INTO cobrancas_recorrentes
                    (contract_id, client_id, gateway_provider, valor, frequency, next_due_date, last_emission_date, active, customer_payload, services)
                    SELECT contract_id, client_id, 'cora', value, frequency, next_due_date, last_emission_date, active, customer_payload, services
                    FROM cora_recorrencia
                    WHERE contract_id NOT IN (SELECT contract_id FROM cobrancas_recorrentes)`,
                    (migErr) => {
                        if (migErr) console.warn('[SQLite] Migração cora_recorrencia falhou:', migErr.message);
                        else console.log('[SQLite] Migração cora_recorrencia → cobrancas_recorrentes concluída.');
                    });
            });

            // Migração contratos: adicionar colunas expandidas (Phase 2 RMR)
            // Usa callback-style (sincrono dentro de serialize)
            sqliteDb.all('PRAGMA table_info(contratos)', [], (err, rows) => {
                if (err || !rows) return;
                const existingCols = rows.map(r => r.name);
                const newCols = [
                    ['valor_anual', 'ALTER TABLE contratos ADD COLUMN valor_anual REAL'],
                    ['tipo_contrato', "ALTER TABLE contratos ADD COLUMN tipo_contrato TEXT DEFAULT 'empresarial'"],
                    ['renovacao_automatica', 'ALTER TABLE contratos ADD COLUMN renovacao_automatica INTEGER DEFAULT 0'],
                    ['qtd_equipamentos_inclusos', 'ALTER TABLE contratos ADD COLUMN qtd_equipamentos_inclusos INTEGER DEFAULT 0'],
                    ['percentual_desconto', 'ALTER TABLE contratos ADD COLUMN percentual_desconto REAL DEFAULT 0'],
                    ['sla_resposta_horas', 'ALTER TABLE contratos ADD COLUMN sla_resposta_horas INTEGER DEFAULT 24'],
                    ['sla_resolucao_horas', 'ALTER TABLE contratos ADD COLUMN sla_resolucao_horas INTEGER DEFAULT 72'],
                    ['created_by', 'ALTER TABLE contratos ADD COLUMN created_by TEXT'],
                    ['observacoes', 'ALTER TABLE contratos ADD COLUMN observacoes TEXT'],
                ];
                for (const [colName, colSql] of newCols) {
                    if (!existingCols.includes(colName)) {
                        try { sqliteDb.run(colSql); } catch (_) { /* skip if fails */ }
                    }
                }
            });

            // Criar índice para contratos por cliente e status
            try { sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_contratos_cliente ON contratos(cliente_id)`); } catch (_) {}
            try { sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_contratos_status ON contratos(status)`); } catch (_) {}

            // ── MÓDULO: Leads (captura + scoring) ──────────────────────────────────
            try { sqliteDb.run(`
                CREATE TABLE IF NOT EXISTS leads (
                    id TEXT PRIMARY KEY,
                    nome TEXT NOT NULL,
                    email TEXT,
                    telefone TEXT,
                    empresa TEXT,
                    origem TEXT DEFAULT 'manual',
                    pontuacao INTEGER DEFAULT 0,
                    status TEXT DEFAULT 'novo',
                    observacoes TEXT,
                    conversion_date TEXT,
                    converted_to_cliente_id TEXT,
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now'))
                )`); } catch (_) {}

            // ── MÓDULO: Localização Técnicos (geolocalização) ──────────────────────
            try { sqliteDb.run(`
                CREATE TABLE IF NOT EXISTS tecnico_localizacao (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tecnico_id TEXT NOT NULL,
                    latitude REAL,
                    longitude REAL,
                    precisao REAL,
                    endereco TEXT,
                    speed REAL,
                    heading REAL,
                    battery_level REAL,
                    app_version TEXT,
                    recorded_at TEXT DEFAULT (datetime('now'))
                )`); } catch (_) {}

            // ── MÓDULO: Avaliações CSAT (pós-serviço) ─────────────────────────────
            try { sqliteDb.run(`
                CREATE TABLE IF NOT EXISTS avaliacoes (
                    id TEXT PRIMARY KEY,
                    chamado_id TEXT NOT NULL,
                    cliente_id TEXT,
                    tecnico_id TEXT,
                    nota INTEGER CHECK(nota >= 1 AND nota <= 5),
                    comentario TEXT,
                    tempo_resposta TEXT,
                    qualidade_equipamento INTEGER,
                    recomendaria INTEGER,
                    responded_at TEXT DEFAULT (datetime('now')),
                    created_at TEXT DEFAULT (datetime('now'))
                )`); } catch (_) {}

            // Índices para as novas tabelas
            try { sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)`); } catch (_) {}
            try { sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_leads_origem ON leads(origem)`); } catch (_) {}
            try { sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_tecnico_loc_tecnico ON tecnico_localizacao(tecnico_id)`); } catch (_) {}
            try { sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_tecnico_loc_recente ON tecnico_localizacao(recorded_at DESC)`); } catch (_) {}
            try { sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_avaliacoes_chamado ON avaliacoes(chamado_id)`); } catch (_) {}

            // ── Cotações / Dimensionamento HVAC ──
            try { sqliteDb.run(`
                CREATE TABLE IF NOT EXISTS cotacoes (
                    id TEXT PRIMARY KEY,
                    cliente_id TEXT,
                    lead_id TEXT,
                    versao INTEGER DEFAULT 1,
                    status TEXT DEFAULT 'rascunho',
                    titulo TEXT,
                    contato_nome TEXT,
                    contato_email TEXT,
                    contato_telefone TEXT,
                    endereco_obra TEXT,
                    ambiente_tipo TEXT,
                    area_m2 REAL,
                    pe_direito_m REAL,
                    num_janelas INTEGER DEFAULT 0,
                    num_portas INTEGER DEFAULT 0,
                    orientacao_solar TEXT,
                    insolacao TEXT,
                    num_pessoas INTEGER DEFAULT 0,
                    num_equipamentos_eletricos INTEGER DEFAULT 0,
                    tipo_uso TEXT,
                    refrigerante TEXT,
                    ambiente_outros TEXT,
                    btu_calculado INTEGER,
                    potencia_kw REAL,
                    equipamento_sugerido_id TEXT,
                    equipamento_sugerido_nome TEXT,
                    custo_equipamento REAL DEFAULT 0,
                    custo_instalacao REAL DEFAULT 0,
                    custo_total REAL DEFAULT 0,
                    custo_mao_obra REAL DEFAULT 0,
                    margem_lucro_percent REAL DEFAULT 30,
                    validade_dias INTEGER DEFAULT 15,
                    validade_em DATETIME,
                    itens_json TEXT,
                    observacoes TEXT,
                    created_by TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
                    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
                )
            `); } catch (_) {}
            try { sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_cotacoes_cliente ON cotacoes(cliente_id)`); } catch (_) {}
            try { sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_cotacoes_lead ON cotacoes(lead_id)`); } catch (_) {}
            try { sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_cotacoes_status ON cotacoes(status)`); } catch (_) {}
            try { sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_cotacoes_validade ON cotacoes(validade_em)`); } catch (_) {}

            // ── Catálogo de Inventário (peças/produtos HVAC) ──
            try { sqliteDb.run(`
                CREATE TABLE IF NOT EXISTS inventory (
                    id TEXT PRIMARY KEY,
                    sku TEXT UNIQUE,
                    nome TEXT NOT NULL,
                    categoria TEXT,
                    subcategoria TEXT,
                    marca TEXT,
                    modelo TEXT,
                    potencia_btu INTEGER,
                    capacidade_w INTEGER,
                    tensao_v INTEGER,
                    refrigerante TEXT,
                    preco_custo REAL DEFAULT 0,
                    preco_venda REAL DEFAULT 0,
                    estoque_atual INTEGER DEFAULT 0,
                    estoque_minimo INTEGER DEFAULT 0,
                    localizacao TEXT,
                    fornecedor TEXT,
                    ativo INTEGER DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `); } catch (_) {}
            try { sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_inv_categoria ON inventory(categoria)`); } catch (_) {}
            try { sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_inv_btu ON inventory(potencia_btu)`); } catch (_) {}
            try { sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_inv_sku ON inventory(sku)`); } catch (_) {}

            // ── Itens de Cotação (BOM - Bill of Materials) ──
            try { sqliteDb.run(`
                CREATE TABLE IF NOT EXISTS cotacao_itens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    cotacao_id TEXT NOT NULL,
                    tipo TEXT,
                    inventory_id TEXT,
                    sku TEXT,
                    descricao TEXT NOT NULL,
                    categoria TEXT,
                    quantidade REAL DEFAULT 1,
                    unidade TEXT DEFAULT 'un',
                    preco_unitario REAL DEFAULT 0,
                    preco_total REAL DEFAULT 0,
                    custo_mao_obra_horas REAL DEFAULT 0,
                    observacoes TEXT,
                    ordem INTEGER DEFAULT 0,
                    FOREIGN KEY (cotacao_id) REFERENCES cotacoes(id) ON DELETE CASCADE,
                    FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE SET NULL
                )
            `); } catch (_) {}
            try { sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_cotacao_itens_cot ON cotacao_itens(cotacao_id)`); } catch (_) {}

            // Popula inventário com peças HVAC típicas se estiver vazio
            try {
                const count = sqliteDb.prepare('SELECT COUNT(*) as n FROM inventory').get();
                if (count.n === 0) {
                    console.log('[Inventory] Populando catálogo inicial de peças HVAC...');
                    const pecasIniciais = [
                        // Equipamentos (Split Hi-Wall)
                        { sku: 'AC-LG-09K', nome: 'Split Hi-Wall LG Dual Inverter 9.000 BTU', categoria: 'equipamento', subcategoria: 'split', marca: 'LG', modelo: 'Dual Inverter', potencia_btu: 9000, refrigerante: 'R-410A', preco_custo: 1400, preco_venda: 2199, estoque_atual: 12, localizacao: 'Depósito A1' },
                        { sku: 'AC-LG-12K', nome: 'Split Hi-Wall LG Dual Inverter 12.000 BTU', categoria: 'equipamento', subcategoria: 'split', marca: 'LG', modelo: 'Dual Inverter', potencia_btu: 12000, refrigerante: 'R-410A', preco_custo: 1700, preco_venda: 2799, estoque_atual: 10, localizacao: 'Depósito A1' },
                        { sku: 'AC-LG-15K', nome: 'Split Hi-Wall LG Dual Inverter 15.000 BTU', categoria: 'equipamento', subcategoria: 'split', marca: 'LG', modelo: 'Dual Inverter', potencia_btu: 15000, refrigerante: 'R-410A', preco_custo: 2200, preco_venda: 3499, estoque_atual: 8, localizacao: 'Depósito A1' },
                        { sku: 'AC-SAM-18K', nome: 'Split Hi-Wall Samsung Wind-Free 18.000 BTU', categoria: 'equipamento', subcategoria: 'split', marca: 'Samsung', modelo: 'Wind-Free', potencia_btu: 18000, refrigerante: 'R-410A', preco_custo: 2700, preco_venda: 4299, estoque_atual: 6, localizacao: 'Depósito A2' },
                        { sku: 'AC-SAM-24K', nome: 'Split Hi-Wall Samsung Wind-Free 24.000 BTU', categoria: 'equipamento', subcategoria: 'split', marca: 'Samsung', modelo: 'Wind-Free', potencia_btu: 24000, refrigerante: 'R-410A', preco_custo: 3700, preco_venda: 5799, estoque_atual: 5, localizacao: 'Depósito A2' },
                        { sku: 'AC-LG-30K', nome: 'Split Hi-Wall LG Dual Inverter 30.000 BTU', categoria: 'equipamento', subcategoria: 'split', marca: 'LG', modelo: 'Dual Inverter', potencia_btu: 30000, refrigerante: 'R-410A', preco_custo: 4500, preco_venda: 7299, estoque_atual: 4, localizacao: 'Depósito A1' },
                        { sku: 'AC-CAR-36K', nome: 'Split Piso-Teto Carrier X-Power 36.000 BTU', categoria: 'equipamento', subcategoria: 'piso-teto', marca: 'Carrier', modelo: 'X-Power', potencia_btu: 36000, refrigerante: 'R-410A', preco_custo: 5800, preco_venda: 8999, estoque_atual: 3, localizacao: 'Depósito B1' },
                        { sku: 'AC-TRN-60K', nome: 'VRF Trane 60.000 BTU', categoria: 'equipamento', subcategoria: 'vrf', marca: 'Trane', modelo: 'VRF', potencia_btu: 60000, refrigerante: 'R-410A', preco_custo: 9800, preco_venda: 15999, estoque_atual: 2, localizacao: 'Depósito C1' },

                        // Tubos de Cobre
                        { sku: 'TB-CU-1-4', nome: 'Tubo de Cobre 1/4" (6.35mm) — 15m', categoria: 'tubulacao', subcategoria: 'cobre', preco_custo: 180, preco_venda: 320, estoque_atual: 50, localizacao: 'Depósito D1' },
                        { sku: 'TB-CU-3-8', nome: 'Tubo de Cobre 3/8" (9.53mm) — 15m', categoria: 'tubulacao', subcategoria: 'cobre', preco_custo: 240, preco_venda: 420, estoque_atual: 40, localizacao: 'Depósito D1' },
                        { sku: 'TB-CU-1-2', nome: 'Tubo de Cobre 1/2" (12.7mm) — 15m', categoria: 'tubulacao', subcategoria: 'cobre', preco_custo: 320, preco_venda: 580, estoque_atual: 30, localizacao: 'Depósito D1' },
                        { sku: 'TB-CU-5-8', nome: 'Tubo de Cobre 5/8" (15.88mm) — 15m', categoria: 'tubulacao', subcategoria: 'cobre', preco_custo: 450, preco_venda: 780, estoque_atual: 25, localizacao: 'Depósito D1' },

                        // Componentes de Instalação
                        { sku: 'SP-1-4', nome: 'Suporte para Condensadora 9-24k BTU', categoria: 'suporte', subcategoria: 'aco', preco_custo: 80, preco_venda: 150, estoque_atual: 30, localizacao: 'Depósito E1' },
                        { sku: 'SP-2', nome: 'Suporte Reforçado 30-60k BTU', categoria: 'suporte', subcategoria: 'aco', preco_custo: 180, preco_venda: 320, estoque_atual: 15, localizacao: 'Depósito E1' },
                        { sku: 'CB-AL-15', nome: 'Cabo Alimentação 4mm² 15m (PP)', categoria: 'cabo', subcategoria: 'pp', preco_custo: 95, preco_venda: 165, estoque_atual: 40, localizacao: 'Depósito F1' },
                        { sku: 'CB-AL-25', nome: 'Cabo Alimentação 6mm² 25m (PP)', categoria: 'cabo', subcategoria: 'pp', preco_custo: 180, preco_venda: 320, estoque_atual: 25, localizacao: 'Depósito F1' },
                        { sku: 'DR-3M', nome: 'Dreno 3m PVC 25mm', categoria: 'dreno', subcategoria: 'pvc', preco_custo: 25, preco_venda: 50, estoque_atual: 80, localizacao: 'Depósito G1' },
                        { sku: 'IS-CL-1', nome: 'Isolamento Térmico 1/4" + 3/8" (rolo 6m)', categoria: 'isolamento', subcategoria: 'borracha', preco_custo: 45, preco_venda: 85, estoque_atual: 60, localizacao: 'Depósito G1' },
                        { sku: 'FT-50', nome: 'Fita de Aço Perfurada 50m', categoria: 'fixacao', subcategoria: 'aco', preco_custo: 35, preco_venda: 65, estoque_atual: 40, localizacao: 'Depósito G1' },
                        { sku: 'GF-2', nome: 'Gás R-410A 2kg (adicional)', categoria: 'refrigerante', subcategoria: 'r410a', preco_custo: 280, preco_venda: 480, estoque_atual: 12, localizacao: 'Depósito H1' },
                        { sku: 'GF-5', nome: 'Gás R-410A 5kg (carga completa)', categoria: 'refrigerante', subcategoria: 'r410a', preco_custo: 650, preco_venda: 1100, estoque_atual: 8, localizacao: 'Depósito H1' },
                        { sku: 'CN-1', nome: 'Conexões + Porcas + Anilhas (kit completo)', categoria: 'conexao', subcategoria: 'cobre', preco_custo: 45, preco_venda: 85, estoque_atual: 100, localizacao: 'Depósito D1' },

                        // Acessórios Elétricos
                        { sku: 'DS-30A', nome: 'Disjuntor 30A Mono', categoria: 'eletrica', subcategoria: 'protecao', preco_custo: 35, preco_venda: 70, estoque_atual: 50, localizacao: 'Depósito F1' },
                        { sku: 'DS-50A', nome: 'Disjuntor 50A Mono', categoria: 'eletrica', subcategoria: 'protecao', preco_custo: 55, preco_venda: 110, estoque_atual: 30, localizacao: 'Depósito F1' }
                    ];

                    const insertPeca = sqliteDb.prepare(`INSERT INTO inventory
                        (id, sku, nome, categoria, subcategoria, marca, modelo, potencia_btu, refrigerante, preco_custo, preco_venda, estoque_atual, localizacao, ativo, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`);

                    pecasIniciais.forEach((p, i) => {
                        const id = `INV-${String(i + 1).padStart(4, '0')}`;
                        insertPeca.run(
                            id, p.sku, p.nome, p.categoria, p.subcategoria, p.marca || null, p.modelo || null,
                            p.potencia_btu || null, p.refrigerante || null,
                            p.preco_custo, p.preco_venda, p.estoque_atual, p.localizacao
                        );
                    });
                    console.log(`[Inventory] ✓ ${pecasIniciais.length} peças HVAC cadastradas`);
                }
            } catch (e) {
                console.warn('[Inventory] Erro ao popular:', e.message);
            }

            // ═══════════════════════════════════════════════════════════════
            // Sprint 13.5 — Migração Multi-tenant: adicionar tenant_id
            // ═══════════════════════════════════════════════════════════════
            // Adiciona coluna `tenant_id` em todas as tabelas de negócio.
            // Linhas existentes recebem `tnt_default` (single-tenant legado).
            // Tabelas globais (config, bancos, templates globais) NÃO ganham coluna.
            //
            // Implementação em callback-chain (initDb não é async; usa sqlite3
            // estilo callback). Cada `table` é processada em série para evitar
            // contenção no DB.

            const tenantMigrationTables = [
                'clientes',
                'contratos',
                'cobrancas',
                'cobrancas_recorrentes',
                'equipamentos',
                'manutencoes_preventivas',
                'checklist_registros',
                'faturas',
                'itens_fatura',
                'leads',
                'cotacoes',
                'cotacao_itens',
                'chamados',
                'avaliacoes',
                'pending_approvals',
                'inventory',
                'logs_auditoria',
                'logs_notificacoes',
                'webhooks_recebidos',
            ];

            const migrateTable = (tableName, cb) => {
                sqliteDb.all(`PRAGMA table_info(${tableName})`, [], (err, cols) => {
                    if (err) return cb(err);
                    const colNames = (cols || []).map(c => c.name);
                    if (colNames.length === 0) return cb(null, { added: 0, updated: 0, indexed: 0 });
                    if (!colNames.includes('tenant_id')) {
                        sqliteDb.run(
                            `ALTER TABLE ${tableName} ADD COLUMN tenant_id TEXT DEFAULT 'tnt_default'`,
                            (alterErr) => {
                                if (alterErr) {
                                    console.warn(`[Sprint13.5] Não foi possível adicionar tenant_id em ${tableName}: ${alterErr.message}`);
                                    return cb(null, { added: 0, updated: 0, indexed: 0 });
                                }
                                proceedAfterAdd(tableName, cb, 1);
                            }
                        );
                    } else {
                        proceedAfterAdd(tableName, cb, 0);
                    }
                });
            };

            const proceedAfterAdd = (tableName, cb, addedFlag) => {
                sqliteDb.run(
                    `UPDATE ${tableName} SET tenant_id = 'tnt_default' WHERE tenant_id IS NULL`,
                    function (updErr) {
                        const updated = updErr ? 0 : (this.changes || 0);
                        sqliteDb.run(
                            `CREATE INDEX IF NOT EXISTS idx_${tableName}_tenant ON ${tableName}(tenant_id)`,
                            (idxErr) => {
                                const indexed = idxErr ? 0 : 1;
                                cb(null, { added: addedFlag, updated, indexed });
                            }
                        );
                    }
                );
            };

            // Executa migrations em série
            const migrateAll = (tables, idx, totals, done) => {
                if (idx >= tables.length) return done(totals);
                migrateTable(tables[idx], (err, res) => {
                    const next = {
                        added: totals.added + (res?.added || 0),
                        updated: totals.updated + (res?.updated || 0),
                        indexed: totals.indexed + (res?.indexed || 0),
                    };
                    if (err) console.warn(`[Sprint13.5] Erro em ${tables[idx]}:`, err.message);
                    migrateAll(tables, idx + 1, next, done);
                });
            };

            migrateAll(tenantMigrationTables, 0, { added: 0, updated: 0, indexed: 0 }, (totals) => {
                console.log(`[Sprint13.5] tenant_id migration: colunas adicionadas=${totals.added}, linhas atualizadas=${totals.updated}, índices criados=${totals.indexed}`);

                // Seed tenant_users: vincula cada user ativo ao tenant default
                sqliteDb.run(`
                    INSERT OR IGNORE INTO tenant_users (id, tenant_id, usuario_id, role, ativo, convidado_por, convidado_em, aceito_em)
                    SELECT
                        'tu_' || u.id,
                        'tnt_default',
                        u.id,
                        CASE WHEN u.role IN ('superadmin', 'admin') THEN 'owner' ELSE 'user' END,
                        1,
                        NULL,
                        CURRENT_TIMESTAMP,
                        CURRENT_TIMESTAMP
                    FROM usuarios u
                    WHERE u.ativo = 1
                    AND NOT EXISTS (SELECT 1 FROM tenant_users tu WHERE tu.usuario_id = u.id AND tu.tenant_id = 'tnt_default')
                `, function (seedErr) {
                    if (seedErr) {
                        console.warn('[Sprint13.5] Falha ao popular tenant_users:', seedErr.message);
                    } else {
                        console.log(`[Sprint13.5] tenant_users seed: ${this.changes || 0} usuários vinculados ao tenant default`);
                    }

                    // Re-vincula órfãos (user ativo sem tenant)
                    sqliteDb.all(`
                        SELECT u.id, u.role
                        FROM usuarios u
                        WHERE u.ativo = 1
                        AND NOT EXISTS (SELECT 1 FROM tenant_users tu WHERE tu.usuario_id = u.id)
                    `, [], (orphErr, orphans) => {
                        if (orphErr) {
                            console.warn('[Sprint13.5] Falha ao buscar órfãos:', orphErr.message);
                            return;
                        }
                        if (!orphans || orphans.length === 0) return;
                        let done = 0;
                        for (const u of orphans) {
                            const role = ['superadmin', 'admin'].includes(u.role) ? 'owner' : 'user';
                            sqliteDb.run(
                                `INSERT OR IGNORE INTO tenant_users (id, tenant_id, usuario_id, role, ativo, convidado_por, convidado_em, aceito_em)
                                 VALUES (?, 'tnt_default', ?, ?, 1, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                                [`tu_${u.id}`, u.id, role],
                                (insErr) => {
                                    done++;
                                    if (done === orphans.length) {
                                        console.log(`[Sprint13.5] ${orphans.length} usuários órfãos re-vinculados ao tenant default`);
                                    }
                                }
                            );
                        }
                    });
                });
            });

            console.log('[SQLite] Tabelas, índices e triggers inicializados com sucesso.');
        });
    }

    // Exporta a API no mesmo formato do driver Postgres
    module.exports = { dbRun, dbGet, dbAll, close, driver: 'sqlite' };
}
