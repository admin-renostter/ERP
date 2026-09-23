/**
 * routes/crm.js — Clientes, Chamados e Comentarios para as telas do CRM.
 *
 * As telas de Clientes e Chamados (admin/, tech/) gravavam tudo so no
 * navegador (localStorage). Estas rotas guardam os mesmos dados no banco, nas
 * tabelas que o resto do sistema ja usa (clientes, chamados), para que um
 * chamado criado pelo tecnico apareca para o admin — e para o cliente no
 * portal, que le a mesma tabela chamados.
 *
 * Campos que so a tela usa (SLA, checklists, apontamentos de horas...) ficam
 * em dados_json. As colunas principais seguem os valores que o restante do
 * sistema espera (ex.: status 'Aberto', prioridade 'Média').
 *
 * Autor de comentarios e auditoria vem sempre do token (req.auditInfo), nunca
 * do corpo da requisicao.
 */
const express = require('express');
const crypto = require('crypto');
const { dbAll, dbGet, dbRun } = require('../database');
const { requireRole } = require('../middleware/authJWT');

const router = express.Router();

const ID_RE = /^[A-Za-z0-9_-]{2,64}$/;
const MAX_DADOS = 900 * 1024;          // por registro (cabe no limite de 1 MB do express.json; fotos chegam reduzidas)
const STATUS_OK = ['Aberto', 'Em Andamento', 'Aguardando Peça', 'Resolvido', 'Fechado', 'Cancelado', 'Reaberto', 'Em Garantia'];
const PRIORIDADE_OK = ['Baixa', 'Média', 'Alta', 'Crítica'];

const LER = requireRole('admin', 'superadmin', 'tech', 'financeiro');
const ESCREVER = requireRole('admin', 'superadmin', 'tech');
const ADMIN = requireRole('admin', 'superadmin');

function tenantOf(req) { return req.tenantId || (req.auditInfo && req.auditInfo.tenantId) || 'tnt_default'; }
function newId(prefix) { return prefix + '_' + crypto.randomBytes(6).toString('hex'); }
function str(v, max = 2000) {
    if (v === undefined || v === null) return null;
    const s = String(v);
    return s.length > max ? s.slice(0, max) : s;
}
function dadosJson(v) {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    if (s.length > MAX_DADOS) { const e = new Error('Dados muito grandes (limite 900 KB). Anexe fotos menores.'); e.status = 413; throw e; }
    return s;
}
function fail(res, e) {
    const msg = String(e && e.message || e);
    if (e && e.status) return res.status(e.status).json({ success: false, error: msg });
    if (/foreign key|violates|FOREIGN KEY/i.test(msg)) {
        return res.status(400).json({ success: false, error: 'Cliente ou técnico informado não existe no banco.' });
    }
    if (/duplicate key|UNIQUE constraint/i.test(msg)) {
        return res.status(409).json({ success: false, error: 'Já existe um registro com este identificador.' });
    }
    console.error('[crm]', msg);
    return res.status(500).json({ success: false, error: 'Erro ao acessar o banco.' });
}
async function audit(req, acao, entidade, entidadeId, detalhes) {
    try {
        await dbRun(
            `INSERT INTO logs_auditoria (user_id, user_name, acao, entidade, entidade_id, detalhes_json) VALUES (?, ?, ?, ?, ?, ?)`,
            [req.auditInfo.userId, req.auditInfo.userName || '', acao, entidade, entidadeId, JSON.stringify(detalhes || {})]
        );
    } catch (e) { console.warn('[crm] auditoria falhou:', e.message); }
}

// ─────────────────────────── Equipe ───────────────────────────
// Lista de usuarios para atribuir chamados (sem senha nem dados sensiveis).
router.get('/equipe', LER, async (req, res) => {
    try {
        const rows = await dbAll('SELECT id, name, nome, email, role, client_id, ativo FROM usuarios');
        const data = rows
            .filter(u => u.ativo !== 0 && u.ativo !== false && u.ativo !== '0')
            .map(u => ({ id: u.id, name: u.name || u.nome || u.email, email: u.email, role: u.role, clientId: u.client_id || null }));
        res.json({ success: true, data });
    } catch (e) { fail(res, e); }
});

// ─────────────────────────── Clientes ───────────────────────────
router.get('/clientes', LER, async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM clientes WHERE tenant_id = ? ORDER BY nome ASC LIMIT 5000', [tenantOf(req)]);
        res.json({ success: true, data: rows });
    } catch (e) { fail(res, e); }
});

function clienteCampos(b) {
    return {
        nome: str(b.nome, 200),
        fantasia: str(b.fantasia, 200),
        email: str(b.email, 200),
        telefone: str(b.telefone, 50),
        celular: str(b.celular, 50),
        cnpj_cpf: str(b.cnpj_cpf, 30),
        status: str(b.status, 30),
        endereco: str(b.endereco, 300),
        cidade: str(b.cidade, 100),
        estado: str(b.estado, 30),
        cep: str(b.cep, 20),
        dados_json: dadosJson(b.dados),
    };
}

router.post('/clientes', ADMIN, async (req, res) => {
    try {
        const b = req.body || {};
        const id = b.id !== undefined ? String(b.id) : newId('cli');
        if (!ID_RE.test(id)) return res.status(400).json({ success: false, error: 'id inválido' });
        const c = clienteCampos(b);
        if (!c.nome) return res.status(400).json({ success: false, error: 'nome é obrigatório' });
        await dbRun(
            `INSERT INTO clientes (id, nome, fantasia, email, telefone, celular, cnpj, cnpj_cpf, status,
                                   endereco, cidade, estado, cep, dados_json, tenant_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, c.nome, c.fantasia, c.email, c.telefone, c.celular, c.cnpj_cpf, c.cnpj_cpf, c.status || 'ativo',
             c.endereco, c.cidade, c.estado, c.cep, c.dados_json || null, tenantOf(req)]
        );
        await audit(req, 'criar_cliente', 'cliente', id, { nome: c.nome });
        res.status(201).json({ success: true, data: await dbGet('SELECT * FROM clientes WHERE id = ?', [id]) });
    } catch (e) { fail(res, e); }
});

router.patch('/clientes/:id', ADMIN, async (req, res) => {
    try {
        const id = req.params.id;
        const atual = await dbGet('SELECT id FROM clientes WHERE id = ? AND tenant_id = ?', [id, tenantOf(req)]);
        if (!atual) return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
        const c = clienteCampos(req.body || {});
        const sets = [], params = [];
        for (const [k, v] of Object.entries(c)) {
            if (v === undefined || (k === 'nome' && !v)) continue;
            if (req.body[k === 'dados_json' ? 'dados' : k] === undefined) continue;
            sets.push(`${k} = ?`); params.push(v);
            if (k === 'cnpj_cpf') { sets.push('cnpj = ?'); params.push(v); }
        }
        if (!sets.length) return res.status(400).json({ success: false, error: 'Nada para atualizar' });
        sets.push('updated_at = CURRENT_TIMESTAMP');
        await dbRun(`UPDATE clientes SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
        res.json({ success: true, data: await dbGet('SELECT * FROM clientes WHERE id = ?', [id]) });
    } catch (e) { fail(res, e); }
});

// Exclusao "suave": o cliente sai das listas mas o historico (chamados,
// faturas, garantias ligados a ele) continua no banco.
router.delete('/clientes/:id', ADMIN, async (req, res) => {
    try {
        const id = req.params.id;
        const atual = await dbGet('SELECT id, nome FROM clientes WHERE id = ? AND tenant_id = ?', [id, tenantOf(req)]);
        if (!atual) return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
        await dbRun(`UPDATE clientes SET status = 'excluido', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
        await audit(req, 'excluir_cliente', 'cliente', id, { nome: atual.nome });
        res.json({ success: true });
    } catch (e) { fail(res, e); }
});

// ─────────────────────────── Chamados ───────────────────────────
router.get('/chamados', LER, async (req, res) => {
    try {
        const rows = await dbAll(
            `SELECT * FROM chamados WHERE tenant_id = ? AND COALESCE(deleted, 0) = 0 ORDER BY data_abertura DESC LIMIT 2000`,
            [tenantOf(req)]
        );
        res.json({ success: true, data: rows });
    } catch (e) { fail(res, e); }
});

function chamadoCampos(b) {
    const c = {
        numero: str(b.numero, 30),
        cliente_id: b.cliente_id === undefined ? undefined : str(b.cliente_id, 64),
        tecnico_id: b.tecnico_id === undefined ? undefined : (b.tecnico_id ? str(b.tecnico_id, 64) : null),
        titulo: str(b.titulo, 300),
        descricao: str(b.descricao, 20000),
        categoria: str(b.categoria, 100),
        prioridade: str(b.prioridade, 30),
        status: str(b.status, 40),
        dados_json: dadosJson(b.dados),
    };
    if (c.prioridade && !PRIORIDADE_OK.includes(c.prioridade)) { const e = new Error('prioridade inválida'); e.status = 400; throw e; }
    if (c.status && !STATUS_OK.includes(c.status)) { const e = new Error('status inválido'); e.status = 400; throw e; }
    return c;
}

async function diasGarantia() {
    try {
        const r = await dbGet(`SELECT valor FROM configuracoes_garantia WHERE nome = 'dias_padrao_garantia'`);
        return parseInt(r && r.valor, 10) || 90;
    } catch (_) { return 90; }
}

router.post('/chamados', ESCREVER, async (req, res) => {
    try {
        const b = req.body || {};
        const id = b.id !== undefined ? String(b.id) : newId('ch');
        if (!ID_RE.test(id)) return res.status(400).json({ success: false, error: 'id inválido' });
        const c = chamadoCampos(b);
        if (!c.cliente_id || !c.titulo) return res.status(400).json({ success: false, error: 'cliente e título são obrigatórios' });
        await dbRun(
            `INSERT INTO chamados (id, numero, cliente_id, tecnico_id, titulo, descricao, categoria, prioridade, status, dados_json, tenant_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, c.numero, c.cliente_id, c.tecnico_id || null, c.titulo, c.descricao || '',
             c.categoria || 'Manutenção Corretiva', c.prioridade || 'Média', c.status || 'Aberto', c.dados_json || null, tenantOf(req)]
        );
        await audit(req, 'criar_chamado', 'chamado', id, { titulo: c.titulo, clienteId: c.cliente_id });
        res.status(201).json({ success: true, data: await dbGet('SELECT * FROM chamados WHERE id = ?', [id]) });
    } catch (e) { fail(res, e); }
});

router.patch('/chamados/:id', ESCREVER, async (req, res) => {
    try {
        const id = req.params.id;
        const atual = await dbGet('SELECT * FROM chamados WHERE id = ? AND tenant_id = ?', [id, tenantOf(req)]);
        if (!atual) return res.status(404).json({ success: false, error: 'Chamado não encontrado' });
        const b = req.body || {};
        const c = chamadoCampos(b);
        const sets = [], params = [];
        for (const [k, v] of Object.entries(c)) {
            if (v === undefined) continue;
            if (b[k === 'dados_json' ? 'dados' : k] === undefined) continue;
            if ((k === 'titulo' || k === 'cliente_id') && !v) continue;
            sets.push(`${k} = ?`); params.push(v);
        }
        // Resolvido pela primeira vez: comeca a garantia (mesma regra do ChamadoManager)
        if (c.status === 'Resolvido' && atual.status !== 'Resolvido' && !atual.data_conclusao) {
            const dias = await diasGarantia();
            const agora = new Date();
            const fim = new Date(agora.getTime() + dias * 86400000);
            sets.push('data_conclusao = ?', 'data_garantia_fim = ?', 'dias_garantia = ?');
            params.push(agora.toISOString(), fim.toISOString(), dias);
        }
        if (!sets.length) return res.status(400).json({ success: false, error: 'Nada para atualizar' });
        sets.push('updated_at = CURRENT_TIMESTAMP');
        await dbRun(`UPDATE chamados SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
        if (c.status && c.status !== atual.status) await audit(req, 'status_chamado', 'chamado', id, { de: atual.status, para: c.status });
        res.json({ success: true, data: await dbGet('SELECT * FROM chamados WHERE id = ?', [id]) });
    } catch (e) { fail(res, e); }
});

// Exclusao "suave" (deleted = 1), a mesma marca que o app mobile ja respeita.
router.delete('/chamados/:id', ADMIN, async (req, res) => {
    try {
        const id = req.params.id;
        const atual = await dbGet('SELECT id, titulo FROM chamados WHERE id = ? AND tenant_id = ?', [id, tenantOf(req)]);
        if (!atual) return res.status(404).json({ success: false, error: 'Chamado não encontrado' });
        await dbRun('UPDATE chamados SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
        await audit(req, 'excluir_chamado', 'chamado', id, { titulo: atual.titulo });
        res.json({ success: true });
    } catch (e) { fail(res, e); }
});

// ─────────────────────────── Comentarios ───────────────────────────
router.get('/comentarios', LER, async (req, res) => {
    try {
        const rows = await dbAll(
            'SELECT * FROM chamado_comentarios WHERE tenant_id = ? ORDER BY created_at ASC LIMIT 10000', [tenantOf(req)]
        );
        res.json({ success: true, data: rows });
    } catch (e) { fail(res, e); }
});

router.post('/chamados/:id/comentarios', ESCREVER, async (req, res) => {
    try {
        const chamadoId = req.params.id;
        const ch = await dbGet('SELECT id FROM chamados WHERE id = ? AND tenant_id = ?', [chamadoId, tenantOf(req)]);
        if (!ch) return res.status(404).json({ success: false, error: 'Chamado não encontrado' });
        const b = req.body || {};
        const id = b.id !== undefined ? String(b.id) : newId('cm');
        if (!ID_RE.test(id)) return res.status(400).json({ success: false, error: 'id inválido' });
        const texto = str(b.texto, 20000);
        await dbRun(
            `INSERT INTO chamado_comentarios (id, chamado_id, autor_id, autor_nome, autor_papel, texto, interno, dados_json, tenant_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, chamadoId, req.auditInfo.userId, req.auditInfo.userName || '', req.auditInfo.role || '',
             texto || '', b.interno ? 1 : 0, dadosJson(b.dados) || null, tenantOf(req)]
        );
        res.status(201).json({ success: true, data: await dbGet('SELECT * FROM chamado_comentarios WHERE id = ?', [id]) });
    } catch (e) { fail(res, e); }
});

module.exports = router;
