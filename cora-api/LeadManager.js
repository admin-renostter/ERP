/**
 * LeadManager — Captura, Scoring e Conversão de Leads
 * Baseado em arquitetura de eventos CDC:
 *   LeadCreated → pontua automaticamente → converte em Cliente
 *   LeadConverted → pubblica evento de domínio
 */
const db = require('./database');
// Sprint 13.8: wrappers tenant-aware
const { dbAllTenant, dbGetTenant, dbRunTenant } = require('./infra/tenantAwareDb');
const crypto = require('crypto');

// ─── Scoring rules ───────────────────────────────────────────────────────────
const SCORE_RULES = {
    // Origem (fonte de captura)
    origem: {
        site_form:       20,  // Preencheu formulário do site
        whatsapp:        25,  // Veio via WhatsApp
        instagram:       15,  // Direct do Instagram
        telefone:        10,  // Ligou diretamente
        recomendado:     30,  // Indicação de cliente
        feira:           15,  // Evento / feira
        google_ads:      20,  // veio de anúncio
        linkedin:        15,  // B2B corporativo
        manual:           5,  // Inserido pelo vendedor
    },
    // Dados preenchidos
    hasEmail:      10,
    hasTelefone:   10,
    hasEmpresa:    15,
    hasObservacoes: 5,
    // Comportamento / sinais
    telefoneWhastapp: 10,  // Número WhatsApp válido
    empresaSetorHVAC: 20,  // Setor de climatização
    ticketMaior5k:    15,  // Potencial > R$5k
};

const STATUS_LABELS = {
    novo:       { label: 'Novo',          color: '#8B949E' },
    qualificado:{ label: 'Qualificado',  color: '#00AEEF' },
    proposta:   { label: 'Proposta',      color: '#f59e0b' },
    negociacao: { label: 'Negociação',     color: '#8b5cf6' },
    convertido: { label: 'Convertido',    color: '#22c55e' },
    perdido:    { label: 'Perdido',       color: '#ef4444' },
};

// ─── Idempotent create ───────────────────────────────────────────────────────
async function createLead(data) {
    const id = data.id || crypto.randomUUID();
    const score = calculateScore(data);
    const status = data.status || deriveStatus(score, 'novo');
    const sql = `INSERT OR IGNORE INTO leads
        (id, nome, email, telefone, empresa, origem, pontuacao, status, observacoes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`;
    await dbRunTenant(sql, [
        id,
        data.nome.trim(),
        data.email || null,
        data.telefone || null,
        data.empresa || null,
        data.origem || 'manual',
        score,
        status,
        data.observacoes || null,
    ]);
    return getLeadById(id);
}

// ─── Scoring engine ───────────────────────────────────────────────────────────
function calculateScore(data) {
    let score = 0;
    const origens = SCORE_RULES.origem;
    score += origens[data.origem] || 0;
    if (data.email)             score += SCORE_RULES.hasEmail;
    if (data.telefone)         score += SCORE_RULES.hasTelefone;
    if (data.empresa)           score += SCORE_RULES.hasEmpresa;
    if (data.observacoes)       score += SCORE_RULES.hasObservacoes;
    // WhatsApp detection: DDD + 9 dígitos = provavelmente WhatsApp
    if (data.telefone && isWhatsApp(data.telefone)) score += SCORE_RULES.telefoneWhastapp;
    return Math.min(100, score); // cap em 100
}

function isWhatsApp(phone) {
    // Remove non-digits
    const digits = String(phone || '').replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 13;
}

// ─── Auto-status based on score ──────────────────────────────────────────────
function deriveStatus(score, currentStatus) {
    if (currentStatus !== 'novo') return currentStatus; // não rebaixa
    if (score >= 60) return 'qualificado';
    if (score >= 30) return 'novo';
    return 'novo';
}

// ─── CRUD ────────────────────────────────────────────────────────────────────
async function getLeadById(id) {
    return dbGetTenant('SELECT * FROM leads WHERE id = ?', [id]);
}

async function updateLead(id, data) {
    const lead = await getLeadById(id);
    if (!lead) throw new Error('Lead não encontrado');

    const updated = {
        nome:         data.nome         !== undefined ? data.nome.trim()              : lead.nome,
        email:        data.email        !== undefined ? (data.email || null)           : lead.email,
        telefone:     data.telefone     !== undefined ? (data.telefone || null)       : lead.telefone,
        empresa:      data.empresa      !== undefined ? (data.empresa || null)         : lead.empresa,
        origem:       data.origem       !== undefined ? (data.origem || 'manual')     : lead.origem,
        status:       data.status       !== undefined ? data.status                   : lead.status,
        observacoes:  data.observacoes  !== undefined ? (data.observacoes || null)    : lead.observacoes,
    };

    const newScore = calculateScore(updated);
    updated.status = data.status || deriveStatus(newScore, lead.status);
    updated.pontuacao = newScore;
    updated.updated_at = "datetime('now')";

    const sql = `UPDATE leads SET
        nome=?, email=?, telefone=?, empresa=?, origem=?, status=?,
        pontuacao=?, observacoes=?, updated_at=${updated.updated_at}
        WHERE id=?`;
    await dbRunTenant(sql, [
        updated.nome, updated.email, updated.telefone, updated.empresa,
        updated.origem, updated.status, updated.pontuacao, updated.observacoes, id
    ]);
    return getLeadById(id);
}

async function deleteLead(id) {
    await dbRunTenant('DELETE FROM leads WHERE id = ?', [id]);
}

async function listLeads(filters = {}) {
    let sql = 'SELECT * FROM leads WHERE 1=1';
    const params = [];

    if (filters.status) {
        sql += ' AND status = ?';
        params.push(filters.status);
    }
    if (filters.origem) {
        sql += ' AND origem = ?';
        params.push(filters.origem);
    }
    if (filters.search) {
        // SECURITY FIX V07: escapar wildcards em LIKE
        const { escapeLike } = require('./infra/tenantAwareDb');
        const safe = escapeLike(filters.search);
        sql += ' AND (nome LIKE ? ESCAPE \'\\\\\' OR email LIKE ? ESCAPE \'\\\\\' OR empresa LIKE ? ESCAPE \'\\\\\')';
        const q = `%${safe}%`;
        params.push(q, q, q);
    }

    sql += ' ORDER BY ';
    switch (filters.sort || 'recente') {
        case 'score':   sql += 'pontuacao DESC'; break;
        case 'nome':    sql += 'nome ASC'; break;
        default:        sql += 'created_at DESC';
    }

    if (filters.limit) {
        sql += ` LIMIT ${parseInt(filters.limit)}`;
        if (filters.offset) sql += ` OFFSET ${parseInt(filters.offset)}`;
    }

    return dbAllTenant(sql, params);
}

async function countLeads(filters = {}) {
    let sql = 'SELECT COUNT(*) as total FROM leads WHERE 1=1';
    const params = [];
    if (filters.status) { sql += ' AND status = ?'; params.push(filters.status); }
    const r = await dbGetTenant(sql, params);
    return r.total;
}

async function getLeadStats() {
    const total   = (await dbGetTenant('SELECT COUNT(*) as n FROM leads')).n || 0;
    const novo    = (await dbGetTenant("SELECT COUNT(*) as n FROM leads WHERE status='novo'")).n || 0;
    const qualif  = (await dbGetTenant("SELECT COUNT(*) as n FROM leads WHERE status='qualificado'")).n || 0;
    const proposta = (await dbGetTenant("SELECT COUNT(*) as n FROM leads WHERE status='proposta'")).n || 0;
    const conv    = (await dbGetTenant("SELECT COUNT(*) as n FROM leads WHERE status='convertido'")).n || 0;
    const perdido = (await dbGetTenant("SELECT COUNT(*) as n FROM leads WHERE status='perdido'")).n || 0;
    const avgScore = (await dbGetTenant('SELECT AVG(pontuacao) as avg FROM leads')).avg || 0;
    const thisMonth = (await dbGetTenant(
        "SELECT COUNT(*) as n FROM leads WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')"
    )).n || 0;

    // Por origem
    const porOrigem = await dbAllTenant(`
        SELECT origem, COUNT(*) as quantidade, ROUND(AVG(pontuacao),1) as avg_score
        FROM leads GROUP BY origem ORDER BY quantidade DESC
    `);

    return {
        total, novo, qualificado: qualif, proposta, convertido: conv, perdido,
        avgScore: Math.round(avgScore), thisMonth,
        porOrigem,
        taxaConversao: total > 0 ? Math.round((conv / total) * 100) : 0,
    };
}

// ─── Conversão Lead → Cliente ─────────────────────────────────────────────────
async function convertLead(id, clienteId) {
    const lead = await getLeadById(id);
    if (!lead) throw new Error('Lead não encontrado');
    if (lead.status === 'convertido') throw new Error('Lead já convertido');

    await dbRunTenant(`UPDATE leads SET
        status='convertido',
        converted_to_cliente_id=?,
        conversion_date=strftime('%Y-%m-%dT%H:%M:%SZ','now'),
        pontuacao=100,
        updated_at=datetime('now')
        WHERE id=?`, [clienteId, id]);

    return getLeadById(id);
}

// ─── Bulk import ─────────────────────────────────────────────────────────────
async function importLeads(rows) {
    const results = { imported: 0, skipped: 0, errors: [] };
    for (const row of rows) {
        try {
            if (!row.nome) { results.skipped++; continue; }
            await createLead(row);
            results.imported++;
        } catch (e) {
            results.errors.push({ row: row.nome, error: e.message });
            results.skipped++;
        }
    }
    return results;
}

// ─── ORIGINS list (for UI dropdowns) ──────────────────────────────────────────
const ORIGINS = [
    { value: 'site_form',    label: 'Site — Formulário' },
    { value: 'whatsapp',     label: 'WhatsApp' },
    { value: 'instagram',    label: 'Instagram' },
    { value: 'telefone',     label: 'Telefone' },
    { value: 'recomendado',  label: 'Recomendado por cliente' },
    { value: 'feira',        label: 'Feira / Evento' },
    { value: 'google_ads',   label: 'Google Ads' },
    { value: 'linkedin',     label: 'LinkedIn' },
    { value: 'email_mkt',    label: 'E-mail Marketing' },
    { value: 'manual',       label: 'Inserção manual' },
    { value: 'visita',        label: 'Visita presencial' },
    { value: 'orcamento',     label: 'Solicitou orçamento' },
];

const STATUSES = [
    { value: 'novo',       label: 'Novo' },
    { value: 'qualificado', label: 'Qualificado' },
    { value: 'proposta',    label: 'Proposta enviada' },
    { value: 'negociacao',  label: 'Negociação' },
    { value: 'convertido',  label: 'Convertido' },
    { value: 'perdido',     label: 'Perdido' },
];

module.exports = {
    createLead, getLeadById, updateLead, deleteLead,
    listLeads, countLeads, getLeadStats,
    convertLead, importLeads,
    calculateScore, deriveStatus, isWhatsApp,
    ORIGINS, STATUSES, STATUS_LABELS,
};
