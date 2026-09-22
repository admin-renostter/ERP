-- Schema v5, gerado em 2026-09-22T17:49:28.740Z
-- Conversao (ordem corrigida): datetime('now')->NOW(), date('now')->CURRENT_DATE, AUTOINCREMENT->SERIAL, DATETIME->TIMESTAMP, BLOB->BYTEA.
-- tenant_id via ALTER TABLE ADD COLUMN IF NOT EXISTS. Tudo idempotente.

CREATE TABLE IF NOT EXISTS bancos_referencia (
                id SERIAL PRIMARY KEY,
                ispb TEXT NOT NULL,
                nome_reduzido TEXT,
                codigo_comp TEXT,
                nome_extenso TEXT,
                suporte_cobranca INTEGER DEFAULT 0,
                url_website TEXT,
                ativo INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE TABLE IF NOT EXISTS bancos_cadastrados (
                id SERIAL PRIMARY KEY,
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (banco_referencia_id) REFERENCES bancos_referencia(id) ON DELETE SET NULL
            );

CREATE TABLE IF NOT EXISTS logs_integracao_bancaria (
                id SERIAL PRIMARY KEY,
                banco_id INTEGER,
                evento TEXT,
                payload TEXT,
                status TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE TABLE IF NOT EXISTS cobrancas (
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                fatura_id TEXT,
                chamado_id_meta TEXT
            );

CREATE TABLE IF NOT EXISTS faturas (
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE TABLE IF NOT EXISTS itens_fatura (
                id SERIAL PRIMARY KEY,
                fatura_id TEXT NOT NULL,
                descricao TEXT,
                quantidade REAL,
                valor_unitario REAL,
                valor_total REAL,
                tipo TEXT DEFAULT 'peca',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (fatura_id) REFERENCES faturas(id) ON DELETE CASCADE
            );

CREATE TABLE IF NOT EXISTS cobrancas_recorrentes (
                id SERIAL PRIMARY KEY,
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE TABLE IF NOT EXISTS webhooks_recebidos (
                id SERIAL PRIMARY KEY,
                provider TEXT,
                event_type TEXT,
                gateway_charge_id TEXT,
                http_status INTEGER,
                raw_payload TEXT,
                processed TEXT DEFAULT 'sim',
                received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE TABLE IF NOT EXISTS logs_integracao_cora (
                id SERIAL PRIMARY KEY,
                provider TEXT,
                tipo TEXT,
                endpoint TEXT,
                payload TEXT,
                response TEXT,
                status INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE TABLE IF NOT EXISTS tokens_integracao (
                id SERIAL PRIMARY KEY,
                provider TEXT NOT NULL,
                client_id TEXT NOT NULL,
                access_token TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(provider, client_id)
            );

CREATE TABLE IF NOT EXISTS logs_auditoria (
                id SERIAL PRIMARY KEY,
                user_id TEXT,
                user_name TEXT,
                acao TEXT NOT NULL,
                entidade TEXT,
                entidade_id TEXT,
                detalhes_json TEXT,
                detalhes_json_full TEXT,
                ip_address TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE TABLE IF NOT EXISTS jwt_revoked (
                jti TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                reason TEXT,
                revoked_by TEXT
            );

CREATE INDEX IF NOT EXISTS idx_jwt_revoked_user ON jwt_revoked(user_id);

CREATE INDEX IF NOT EXISTS idx_jwt_revoked_expires ON jwt_revoked(expires_at);

CREATE TABLE IF NOT EXISTS security_events (
                id SERIAL PRIMARY KEY,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                event_type TEXT NOT NULL,
                severity TEXT NOT NULL,
                user_id TEXT,
                user_email TEXT,
                ip TEXT,
                user_agent TEXT,
                path TEXT,
                method TEXT,
                details_json TEXT
            );

CREATE INDEX IF NOT EXISTS idx_se_event_type ON security_events(event_type);

CREATE INDEX IF NOT EXISTS idx_se_user_id ON security_events(user_id);

CREATE INDEX IF NOT EXISTS idx_se_ip ON security_events(ip);

CREATE INDEX IF NOT EXISTS idx_se_timestamp ON security_events(timestamp);

CREATE INDEX IF NOT EXISTS idx_se_severity ON security_events(severity);

CREATE TABLE IF NOT EXISTS fin_fluxo_caixa (
                id SERIAL PRIMARY KEY,
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE INDEX IF NOT EXISTS idx_fc_data ON fin_fluxo_caixa(data);

CREATE INDEX IF NOT EXISTS idx_fc_tipo ON fin_fluxo_caixa(tipo);

CREATE INDEX IF NOT EXISTS idx_fc_status ON fin_fluxo_caixa(status);

CREATE INDEX IF NOT EXISTS idx_fc_periodo ON fin_fluxo_caixa(periodo);

CREATE TABLE IF NOT EXISTS fin_custo_producao (
                id SERIAL PRIMARY KEY,
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE INDEX IF NOT EXISTS idx_cp_produto ON fin_custo_producao(produto);

CREATE INDEX IF NOT EXISTS idx_cp_periodo ON fin_custo_producao(periodo);

CREATE TABLE IF NOT EXISTS fin_conciliacao (
                id SERIAL PRIMARY KEY,
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE INDEX IF NOT EXISTS idx_conc_data ON fin_conciliacao(data);

CREATE INDEX IF NOT EXISTS idx_conc_origem_tipo ON fin_conciliacao(origem_tipo);

CREATE INDEX IF NOT EXISTS idx_conc_conciliado ON fin_conciliacao(conciliado);

CREATE TABLE IF NOT EXISTS fin_precificacao (
                id SERIAL PRIMARY KEY,
                tipo TEXT NOT NULL,                  -- 'fixa' | 'variavel'
                categoria TEXT NOT NULL,             -- 'aluguel', 'energia', etc
                descricao TEXT,
                valor REAL NOT NULL DEFAULT 0,
                competencia_mes TEXT,                -- 'YYYY-MM'
                ativo INTEGER DEFAULT 1,
                tenant_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE INDEX IF NOT EXISTS idx_prec_tipo ON fin_precificacao(tipo);

CREATE INDEX IF NOT EXISTS idx_prec_competencia ON fin_precificacao(competencia_mes);

CREATE TABLE IF NOT EXISTS fin_contas (
                id SERIAL PRIMARY KEY,
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE INDEX IF NOT EXISTS idx_contas_tipo ON fin_contas(tipo);

CREATE INDEX IF NOT EXISTS idx_contas_status ON fin_contas(status);

CREATE INDEX IF NOT EXISTS idx_contas_vencimento ON fin_contas(data_vencimento);

CREATE INDEX IF NOT EXISTS idx_contas_cliente ON fin_contas(cliente_id);

CREATE TABLE IF NOT EXISTS fin_inadimplencia (
                id SERIAL PRIMARY KEY,
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE INDEX IF NOT EXISTS idx_inad_cliente ON fin_inadimplencia(cliente_id);

CREATE INDEX IF NOT EXISTS idx_inad_status ON fin_inadimplencia(status);

CREATE INDEX IF NOT EXISTS idx_inad_dias ON fin_inadimplencia(dias_atraso);

CREATE TABLE IF NOT EXISTS fin_balanco (
                id SERIAL PRIMARY KEY,
                tipo TEXT NOT NULL,                  -- 'ativo' | 'passivo'
                categoria TEXT NOT NULL,             -- 'circulante' | 'nao_circulante' | 'pleno'
                subcategoria TEXT,                   -- 'caixa', 'cheques', 'fornecedores', etc
                valor REAL NOT NULL DEFAULT 0,
                trimestre TEXT NOT NULL,            -- 'YYYY-Q1' | 'YYYY-Q2' | etc
                observacoes TEXT,
                tenant_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE INDEX IF NOT EXISTS idx_bal_tipo ON fin_balanco(tipo);

CREATE INDEX IF NOT EXISTS idx_bal_trimestre ON fin_balanco(trimestre);

CREATE TABLE IF NOT EXISTS fin_orcamento (
                id SERIAL PRIMARY KEY,
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE INDEX IF NOT EXISTS idx_orc_cliente ON fin_orcamento(cliente_id);

CREATE INDEX IF NOT EXISTS idx_orc_status ON fin_orcamento(status);

CREATE INDEX IF NOT EXISTS idx_orc_numero ON fin_orcamento(numero);

CREATE TABLE IF NOT EXISTS fin_orcamento_itens (
                id SERIAL PRIMARY KEY,
                orcamento_id INTEGER NOT NULL,
                descricao TEXT NOT NULL,
                tipo TEXT,                            -- 'servico' | 'material'
                quantidade REAL DEFAULT 1,
                valor_unitario REAL NOT NULL,
                valor_total REAL NOT NULL,
                observacoes TEXT
            );

CREATE INDEX IF NOT EXISTS idx_orc_itens ON fin_orcamento_itens(orcamento_id);

CREATE TABLE IF NOT EXISTS fin_dre (
                id SERIAL PRIMARY KEY,
                tipo TEXT NOT NULL,                  -- 'receita' | 'despesa'
                categoria TEXT NOT NULL,
                descricao TEXT,
                valor REAL NOT NULL,
                mes TEXT NOT NULL,                   -- 'YYYY-MM'
                data DATE NOT NULL,
                observacoes TEXT,
                tenant_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE INDEX IF NOT EXISTS idx_dre_mes ON fin_dre(mes);

CREATE INDEX IF NOT EXISTS idx_dre_tipo ON fin_dre(tipo);

CREATE INDEX IF NOT EXISTS idx_dre_data ON fin_dre(data);

CREATE TABLE IF NOT EXISTS configuracoes_integracao (
                id SERIAL PRIMARY KEY,
                provider TEXT NOT NULL,
                ambiente TEXT NOT NULL,
                client_id TEXT,
                client_secret_encrypted TEXT,
                ativo INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE TABLE IF NOT EXISTS cora_logs (
                id SERIAL PRIMARY KEY,
                type TEXT,
                direction TEXT,
                endpoint TEXT,
                contract_id TEXT,
                charge_id TEXT,
                http_status INTEGER,
                payload TEXT,
                response TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE TABLE IF NOT EXISTS logs_notificacoes (
                id SERIAL PRIMARY KEY,
                cobranca_id TEXT,
                canal TEXT,
                destinatario TEXT,
                mensagem TEXT,
                status TEXT,
                provider_response TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE TABLE IF NOT EXISTS pending_approvals (
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
                decided_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE TABLE IF NOT EXISTS usuarios (
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
                password_changed_at TIMESTAMP,
                last_login_at TIMESTAMP,
                last_login_ip TEXT,
                failed_login_count INTEGER DEFAULT 0,
                locked_until TIMESTAMP,
                ativo INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(email),
                UNIQUE(username)
            );

CREATE TABLE IF NOT EXISTS clientes (
                id TEXT PRIMARY KEY,
                nome TEXT NOT NULL,
                email TEXT,
                telefone TEXT,
                cnpj TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE TABLE IF NOT EXISTS chamados (
                id TEXT PRIMARY KEY,
                cliente_id TEXT NOT NULL,
                tecnico_id TEXT,
                titulo TEXT NOT NULL,
                descricao TEXT,
                categoria TEXT DEFAULT 'Manutenção Corretiva',
                prioridade TEXT DEFAULT 'Média',
                status TEXT DEFAULT 'Aberto',
                data_abertura TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                data_conclusao TIMESTAMP,
                data_garantia_fim TIMESTAMP,
                dias_garantia INTEGER DEFAULT 90,
                motivo_reabertura TEXT,
                chamado_original_id TEXT,
                qtd_reaberturas INTEGER DEFAULT 0,
                observacoes_garantia TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
                FOREIGN KEY (tecnico_id) REFERENCES usuarios(id) ON DELETE SET NULL,
                FOREIGN KEY (chamado_original_id) REFERENCES chamados(id) ON DELETE SET NULL
            );

CREATE TABLE IF NOT EXISTS logs_garantia (
                id SERIAL PRIMARY KEY,
                chamado_id TEXT NOT NULL,
                usuario_id TEXT,
                usuario_nome TEXT,
                acao TEXT NOT NULL,
                motivo TEXT,
                detalhes TEXT,
                data_acao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (chamado_id) REFERENCES chamados(id) ON DELETE CASCADE
            );

CREATE TABLE IF NOT EXISTS configuracoes_garantia (
                id SERIAL PRIMARY KEY,
                nome TEXT NOT NULL UNIQUE,
                valor TEXT NOT NULL,
                descricao TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE INDEX IF NOT EXISTS idx_pa_status ON pending_approvals(status, created_at);

CREATE INDEX IF NOT EXISTS idx_pa_client ON pending_approvals(client_id);

CREATE INDEX IF NOT EXISTS idx_chamados_status ON chamados(status);

CREATE INDEX IF NOT EXISTS idx_chamados_cliente ON chamados(cliente_id);

CREATE INDEX IF NOT EXISTS idx_chamados_garantia_fim ON chamados(data_garantia_fim);

CREATE INDEX IF NOT EXISTS idx_chamados_original ON chamados(chamado_original_id);

CREATE INDEX IF NOT EXISTS idx_logs_garantia_chamado ON logs_garantia(chamado_id, data_acao);

CREATE TABLE IF NOT EXISTS contratos (
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL
            );

CREATE TABLE IF NOT EXISTS tenants (
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
                data_expiracao TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);

CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status, data_expiracao);

CREATE TABLE IF NOT EXISTS tenant_users (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                usuario_id TEXT NOT NULL,
                role TEXT DEFAULT 'user',         -- owner | admin | user | viewer
                ativo INTEGER DEFAULT 1,
                convidado_por TEXT,
                convidado_em TIMESTAMP,
                aceito_em TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id, usuario_id),
                FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
            );

CREATE INDEX IF NOT EXISTS idx_tenant_users_user ON tenant_users(usuario_id, ativo);

CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON tenant_users(tenant_id, ativo);

CREATE TABLE IF NOT EXISTS tenant_invites (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                email TEXT NOT NULL,
                role TEXT DEFAULT 'user',
                token TEXT UNIQUE NOT NULL,
                expira_em TIMESTAMP NOT NULL,
                aceito_em TIMESTAMP,
                convidado_por TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
            );

CREATE TABLE IF NOT EXISTS consentimentos (
                id TEXT PRIMARY KEY,
                cliente_id TEXT NOT NULL,
                tipo TEXT NOT NULL,                 -- 'marketing_email' | 'marketing_sms' | 'marketing_whatsapp' | 'compartilhamento_dados' | 'cookies' | 'newsletter'
                aceito INTEGER DEFAULT 0,            -- 0 = não, 1 = sim
                ip TEXT,
                user_agent TEXT,
                metodo_coleta TEXT,                  -- 'web_form' | 'api' | 'import' | 'contrato' | 'manual'
                detalhes TEXT,                        -- JSON com contexto (qual form, qual página)
                aceito_em TIMESTAMP,
                revogado_em TIMESTAMP,
                expira_em TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
            );

CREATE INDEX IF NOT EXISTS idx_consent_cliente ON consentimentos(cliente_id, tipo);

CREATE INDEX IF NOT EXISTS idx_consent_tipo_aceito ON consentimentos(tipo, aceito);

CREATE TABLE IF NOT EXISTS dsar_pedidos (
                id TEXT PRIMARY KEY,
                cliente_id TEXT NOT NULL,
                tipo TEXT NOT NULL,                   -- 'acesso' | 'portabilidade' | 'correcao' | 'exclusao' | 'oposicao'
                status TEXT DEFAULT 'pendente',       -- 'pendente' | 'em_analise' | 'concluido' | 'rejeitado' | 'expirado'
                descricao TEXT,                       -- Texto do titular
                prazo_legal TIMESTAMP,                 -- Prazo legal (15 dias para LGPD)
                recebido_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                concluido_em TIMESTAMP,
                atribuido_para TEXT,                  -- Quem está analisando
                resposta TEXT,                         -- Resposta enviada ao titular
                arquivo_export_url TEXT,              -- URL do arquivo gerado (portabilidade)
                ip TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
            );

CREATE INDEX IF NOT EXISTS idx_dsar_cliente ON dsar_pedidos(cliente_id, status);

CREATE INDEX IF NOT EXISTS idx_dsar_status_prazo ON dsar_pedidos(status, prazo_legal);

CREATE TABLE IF NOT EXISTS audit_acessos (
                id SERIAL PRIMARY KEY,
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_acessos(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_cliente ON audit_acessos(cliente_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_entidade ON audit_acessos(entidade, entidade_id);

CREATE TABLE IF NOT EXISTS politica_retencao (
                id SERIAL PRIMARY KEY,
                entidade TEXT NOT NULL,                -- 'cobrancas' | 'chamados' | 'logs' | etc
                dias_retencao INTEGER NOT NULL,
                acao_pos_expiracao TEXT DEFAULT 'anonimizar',  -- 'deletar' | 'anonimizar' | 'manter'
                ativo INTEGER DEFAULT 1,
                descricao TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE TABLE IF NOT EXISTS chamado_fotos (
                id TEXT PRIMARY KEY,
                chamado_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                mime_type TEXT,
                tamanho_bytes INTEGER,
                latitude REAL,
                longitude REAL,
                uploaded_by TEXT,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                -- Sprint 16.6: versionamento para sync offline
                version INTEGER DEFAULT 1,
                deleted INTEGER DEFAULT 0,
                FOREIGN KEY (chamado_id) REFERENCES chamados(id) ON DELETE CASCADE
            );

CREATE INDEX IF NOT EXISTS idx_chamado_fotos_chamado ON chamado_fotos(chamado_id, deleted);

CREATE INDEX IF NOT EXISTS idx_chamado_fotos_uploaded ON chamado_fotos(uploaded_at DESC);

CREATE TABLE IF NOT EXISTS push_tokens (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                token TEXT UNIQUE NOT NULL,
                platform TEXT NOT NULL,            -- 'ios' | 'android' | 'web'
                device_id TEXT,
                device_name TEXT,
                app_version TEXT,
                ativo INTEGER DEFAULT 1,
                ultimo_uso_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
            );

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id, ativo);

CREATE INDEX IF NOT EXISTS idx_push_tokens_token ON push_tokens(token);

CREATE TABLE IF NOT EXISTS mobile_sync_log (
                id SERIAL PRIMARY KEY,
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
            );

CREATE INDEX IF NOT EXISTS idx_sync_log_user ON mobile_sync_log(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS portal_users (
                id TEXT PRIMARY KEY,
                cliente_id TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                nome TEXT,
                telefone TEXT,
                ativo INTEGER DEFAULT 1,
                email_verificado INTEGER DEFAULT 0,
                ultimo_login_at TIMESTAMP,
                ultimo_login_ip TEXT,
                password_reset_token TEXT,
                password_reset_expira_em TIMESTAMP,
                failed_login_count INTEGER DEFAULT 0,
                locked_until TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
            );

CREATE INDEX IF NOT EXISTS idx_portal_users_email ON portal_users(email);

CREATE INDEX IF NOT EXISTS idx_portal_users_cliente ON portal_users(cliente_id);

CREATE INDEX IF NOT EXISTS idx_portal_users_token ON portal_users(password_reset_token);

CREATE TABLE IF NOT EXISTS portal_sessions (
                id TEXT PRIMARY KEY,
                portal_user_id TEXT NOT NULL,
                jti TEXT UNIQUE NOT NULL,        -- JWT ID
                ip TEXT,
                user_agent TEXT,
                expira_em TIMESTAMP NOT NULL,
                revogada_em TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (portal_user_id) REFERENCES portal_users(id) ON DELETE CASCADE
            );

CREATE INDEX IF NOT EXISTS idx_portal_sessions_user ON portal_sessions(portal_user_id);

CREATE INDEX IF NOT EXISTS idx_portal_sessions_jti ON portal_sessions(jti);

CREATE TABLE IF NOT EXISTS portal_notifications (
                id TEXT PRIMARY KEY,
                portal_user_id TEXT NOT NULL,
                tipo TEXT NOT NULL,             -- 'boleto' | 'vencimento' | 'chamado' | 'manutencao' | 'geral'
                titulo TEXT NOT NULL,
                mensagem TEXT,
                link TEXT,                       -- URL interna do portal para ação
                lida_em TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (portal_user_id) REFERENCES portal_users(id) ON DELETE CASCADE
            );

CREATE INDEX IF NOT EXISTS idx_portal_notif_user ON portal_notifications(portal_user_id, lida_em);

CREATE TABLE IF NOT EXISTS contract_templates (
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE INDEX IF NOT EXISTS idx_templates_slug ON contract_templates(slug);

CREATE INDEX IF NOT EXISTS idx_templates_categoria ON contract_templates(categoria, ativo);

CREATE TABLE IF NOT EXISTS contratos_gerados (
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                data_envio TIMESTAMP,
                data_assinatura TIMESTAMP,
                FOREIGN KEY (template_id) REFERENCES contract_templates(id) ON DELETE SET NULL,
                FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE SET NULL,
                FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL
            );

CREATE INDEX IF NOT EXISTS idx_contratos_gerados_status ON contratos_gerados(status);

CREATE INDEX IF NOT EXISTS idx_contratos_gerados_cliente ON contratos_gerados(cliente_id);

CREATE INDEX IF NOT EXISTS idx_contratos_gerados_autentique ON contratos_gerados(autentique_document_id);

CREATE INDEX IF NOT EXISTS idx_contratos_gerados_contrato ON contratos_gerados(contrato_id);

CREATE TABLE IF NOT EXISTS equipamentos (
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
                FOREIGN KEY (contract_id) REFERENCES contratos(id) ON DELETE SET NULL
            );

CREATE TABLE IF NOT EXISTS manutencoes_preventivas (
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id) ON DELETE CASCADE
            );

CREATE TABLE IF NOT EXISTS checklist_pmoc (
                id SERIAL PRIMARY KEY,
                tipo_manutencao TEXT NOT NULL,
                item_ordem INTEGER DEFAULT 0,
                item_descricao TEXT NOT NULL,
                item_categoria TEXT,
                obrigatorio INTEGER DEFAULT 1,
                ativo INTEGER DEFAULT 1
            );

CREATE TABLE IF NOT EXISTS checklist_registros (
                id TEXT PRIMARY KEY,
                manutencao_id TEXT NOT NULL,
                item_id INTEGER NOT NULL,
                resultado TEXT,
                observacao TEXT,
                foto_base64 TEXT,
                executado_por TEXT,
                executado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (manutencao_id) REFERENCES manutencoes_preventivas(id) ON DELETE CASCADE,
                FOREIGN KEY (item_id) REFERENCES checklist_pmoc(id) ON DELETE CASCADE
            );

CREATE TABLE IF NOT EXISTS configuracoes_pmoc (
                id SERIAL PRIMARY KEY,
                nome TEXT NOT NULL UNIQUE,
                valor TEXT NOT NULL,
                descricao TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE INDEX IF NOT EXISTS idx_pa_tier ON pending_approvals(tier, status);

CREATE INDEX IF NOT EXISTS idx_equip_cliente ON equipamentos(cliente_id);

CREATE INDEX IF NOT EXISTS idx_equip_contract ON equipamentos(contract_id);

CREATE INDEX IF NOT EXISTS idx_equip_status ON equipamentos(status_equipamento);

CREATE INDEX IF NOT EXISTS idx_mp_equip ON manutencoes_preventivas(equipamento_id);

CREATE INDEX IF NOT EXISTS idx_mp_proxima ON manutencoes_preventivas(proxima_data, status);

CREATE INDEX IF NOT EXISTS idx_mp_tipo ON manutencoes_preventivas(tipo_manutencao);

CREATE INDEX IF NOT EXISTS idx_checklist_tipo ON checklist_pmoc(tipo_manutencao, ativo);

CREATE INDEX IF NOT EXISTS idx_registro_manut ON checklist_registros(manutencao_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bancos_ref_ispb ON bancos_referencia(ispb);

CREATE INDEX IF NOT EXISTS idx_bancos_ref_codigo ON bancos_referencia(codigo_comp);

CREATE INDEX IF NOT EXISTS idx_bancos_ref_nome ON bancos_referencia(nome_reduzido);

CREATE INDEX IF NOT EXISTS idx_bancos_cad_ref ON bancos_cadastrados(banco_referencia_id);

CREATE INDEX IF NOT EXISTS idx_bancos_cad_primary ON bancos_cadastrados(is_primary, ativo);

CREATE INDEX IF NOT EXISTS idx_cobrancas_contract ON cobrancas(contract_id);

CREATE INDEX IF NOT EXISTS idx_cobrancas_client ON cobrancas(client_id);

CREATE INDEX IF NOT EXISTS idx_cobrancas_status ON cobrancas(status);

CREATE INDEX IF NOT EXISTS idx_cobrancas_vencimento ON cobrancas(data_vencimento);

CREATE INDEX IF NOT EXISTS idx_cobrancas_gateway ON cobrancas(gateway_charge_id);

CREATE INDEX IF NOT EXISTS idx_cobrancas_created ON cobrancas(created_at);

CREATE INDEX IF NOT EXISTS idx_recorrentes_next ON cobrancas_recorrentes(active, next_due_date);

CREATE INDEX IF NOT EXISTS idx_webhooks_charge ON webhooks_recebidos(gateway_charge_id);

CREATE INDEX IF NOT EXISTS idx_webhooks_date ON webhooks_recebidos(received_at);

CREATE INDEX IF NOT EXISTS idx_audit_entidade ON logs_auditoria(entidade, entidade_id);

CREATE INDEX IF NOT EXISTS idx_audit_date ON logs_auditoria(created_at);

CREATE INDEX IF NOT EXISTS idx_notif_cobranca ON logs_notificacoes(cobranca_id);

CREATE INDEX IF NOT EXISTS idx_cora_logs_contract ON cora_logs(contract_id);

CREATE INDEX IF NOT EXISTS idx_contratos_cliente ON contratos(cliente_id);

CREATE INDEX IF NOT EXISTS idx_contratos_status ON contratos(status);

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
                    created_at TEXT DEFAULT (NOW()),
                    updated_at TEXT DEFAULT (NOW())
                );

CREATE TABLE IF NOT EXISTS tecnico_localizacao (
                    id SERIAL PRIMARY KEY,
                    tecnico_id TEXT NOT NULL,
                    latitude REAL,
                    longitude REAL,
                    precisao REAL,
                    endereco TEXT,
                    speed REAL,
                    heading REAL,
                    battery_level REAL,
                    app_version TEXT,
                    recorded_at TEXT DEFAULT (NOW())
                );

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
                    responded_at TEXT DEFAULT (NOW()),
                    created_at TEXT DEFAULT (NOW())
                );

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

CREATE INDEX IF NOT EXISTS idx_leads_origem ON leads(origem);

CREATE INDEX IF NOT EXISTS idx_tecnico_loc_tecnico ON tecnico_localizacao(tecnico_id);

CREATE INDEX IF NOT EXISTS idx_tecnico_loc_recente ON tecnico_localizacao(recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_avaliacoes_chamado ON avaliacoes(chamado_id);

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
                    validade_em TIMESTAMP,
                    itens_json TEXT,
                    observacoes TEXT,
                    created_by TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
                    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
                );

CREATE INDEX IF NOT EXISTS idx_cotacoes_cliente ON cotacoes(cliente_id);

CREATE INDEX IF NOT EXISTS idx_cotacoes_lead ON cotacoes(lead_id);

CREATE INDEX IF NOT EXISTS idx_cotacoes_status ON cotacoes(status);

CREATE INDEX IF NOT EXISTS idx_cotacoes_validade ON cotacoes(validade_em);

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
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

CREATE INDEX IF NOT EXISTS idx_inv_categoria ON inventory(categoria);

CREATE INDEX IF NOT EXISTS idx_inv_btu ON inventory(potencia_btu);

CREATE INDEX IF NOT EXISTS idx_inv_sku ON inventory(sku);

CREATE TABLE IF NOT EXISTS cotacao_itens (
                    id SERIAL PRIMARY KEY,
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
                );

CREATE INDEX IF NOT EXISTS idx_cotacao_itens_cot ON cotacao_itens(cotacao_id);

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'tnt_default';

ALTER TABLE contratos ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'tnt_default';

ALTER TABLE cobrancas ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'tnt_default';

ALTER TABLE cobrancas_recorrentes ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'tnt_default';

ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'tnt_default';

ALTER TABLE manutencoes_preventivas ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'tnt_default';

ALTER TABLE checklist_registros ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'tnt_default';

ALTER TABLE faturas ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'tnt_default';

ALTER TABLE itens_fatura ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'tnt_default';

ALTER TABLE leads ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'tnt_default';

ALTER TABLE cotacoes ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'tnt_default';

ALTER TABLE cotacao_itens ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'tnt_default';

ALTER TABLE chamados ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'tnt_default';

ALTER TABLE avaliacoes ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'tnt_default';

ALTER TABLE pending_approvals ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'tnt_default';

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'tnt_default';

ALTER TABLE logs_auditoria ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'tnt_default';

ALTER TABLE logs_notificacoes ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'tnt_default';

ALTER TABLE webhooks_recebidos ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'tnt_default';

ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'tnt_default';

CREATE INDEX IF NOT EXISTS idx_clientes_tenant ON clientes(tenant_id);

CREATE INDEX IF NOT EXISTS idx_contratos_tenant ON contratos(tenant_id);

CREATE INDEX IF NOT EXISTS idx_cobrancas_tenant ON cobrancas(tenant_id);

CREATE INDEX IF NOT EXISTS idx_cobrancas_recorrentes_tenant ON cobrancas_recorrentes(tenant_id);

CREATE INDEX IF NOT EXISTS idx_equipamentos_tenant ON equipamentos(tenant_id);

CREATE INDEX IF NOT EXISTS idx_manutencoes_preventivas_tenant ON manutencoes_preventivas(tenant_id);

CREATE INDEX IF NOT EXISTS idx_checklist_registros_tenant ON checklist_registros(tenant_id);

CREATE INDEX IF NOT EXISTS idx_faturas_tenant ON faturas(tenant_id);

CREATE INDEX IF NOT EXISTS idx_itens_fatura_tenant ON itens_fatura(tenant_id);

CREATE INDEX IF NOT EXISTS idx_leads_tenant ON leads(tenant_id);

CREATE INDEX IF NOT EXISTS idx_cotacoes_tenant ON cotacoes(tenant_id);

CREATE INDEX IF NOT EXISTS idx_cotacao_itens_tenant ON cotacao_itens(tenant_id);

CREATE INDEX IF NOT EXISTS idx_chamados_tenant ON chamados(tenant_id);

CREATE INDEX IF NOT EXISTS idx_avaliacoes_tenant ON avaliacoes(tenant_id);

CREATE INDEX IF NOT EXISTS idx_pending_approvals_tenant ON pending_approvals(tenant_id);

CREATE INDEX IF NOT EXISTS idx_inventory_tenant ON inventory(tenant_id);

CREATE INDEX IF NOT EXISTS idx_logs_auditoria_tenant ON logs_auditoria(tenant_id);

CREATE INDEX IF NOT EXISTS idx_logs_notificacoes_tenant ON logs_notificacoes(tenant_id);

CREATE INDEX IF NOT EXISTS idx_webhooks_recebidos_tenant ON webhooks_recebidos(tenant_id);

CREATE INDEX IF NOT EXISTS idx_contratos_gerados_tenant ON contratos_gerados(tenant_id);

