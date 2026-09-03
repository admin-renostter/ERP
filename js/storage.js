/**
 * RENOSTTER CRM — Storage Layer (localStorage CRUD)
 * Interface única: db.get / db.find / db.insert / db.update / db.delete
 */

const COLLECTIONS = ['users', 'clients', 'contracts', 'tickets', 'comments', 'csat', 'notifications', 'history', 'transfers', 'auditlog', 'documents', 'inventory', 'stock_movements', 'suppliers', 'import_logs', 'knowledge_base', 'library', 'financial_transactions', 'financial_categories', 'inventory_categories', 'product_history', 'import_history', 'faturas', 'itens_fatura', 'proposals'];
const DB_PREFIX = 'rcrm_';
const SEED_VERSION = 'v10'; // v10: Advanced Inventory CRUD



/* ─── Core CRUD ─── */
const db = {
    _store(col) { return DB_PREFIX + col; },

    /* Check if localStorage is available (fails in some private/incognito browsers) */
    storageAvailable() {
        try {
            const test = '__rcrm_test__';
            localStorage.setItem(test, '1');
            localStorage.removeItem(test);
            return true;
        } catch { return false; }
    },

    get(col) {
        try {
            return JSON.parse(localStorage.getItem(db._store(col)) || '[]');
        } catch (e) {
            console.error('[RCRM] Storage read error:', col, e);
            return [];
        }
    },

    set(col, arr) {
        try {
            localStorage.setItem(db._store(col), JSON.stringify(arr));
        } catch (e) {
            console.error('[RCRM] Storage write error:', col, e);
            // QuotaExceededError or SecurityError (private mode)
            if (typeof toast === 'function') {
                toast('Erro de armazenamento', 'O navegador não conseguiu salvar os dados. Verifique o espaço/modo privado.', 'error');
            }
        }
    },

    find(col, id) { return db.get(col).find(r => r.id === id) || null; },
    findBy(col, field, value) { return db.get(col).filter(r => r[field] === value); },

    insert(col, data) {
        if (col === 'users' && data.role === 'superadmin') {
            const authStr = sessionStorage.getItem('rcrm_session');
            const authObj = authStr ? JSON.parse(authStr) : null;
            if (!authObj || authObj.role !== 'superadmin') {
                console.error('[API BACKEND REJECT] Tentativa de escalonamento bloqueada: Apenas superadmins podem criar superadmins.');
                throw { status: 403, message: 'Você não tem permissão para criar usuários do tipo superadmin' };
            }
        }

        let finalData = { ...data };
        const now = new Date();
        if (col === 'tickets') {
            const slaRules = calculateSlaDeadlines(data.priority, data.category, now);
            finalData = { ...finalData, ...slaRules };
        }

        const records = db.get(col);
        const record = { id: db._uid(), createdAt: now.toISOString(), ...finalData };
        records.push(record);
        db.set(col, records);
        return record;
    },

    update(col, id, data) {
        if (col === 'users' && data.role) {
            const records = db.get(col);
            const target = records.find(r => r.id === id);
            // If elevating someone to superadmin, or editing an existing superadmin
            if ((target && target.role === 'superadmin') || data.role === 'superadmin') {
                const authStr = sessionStorage.getItem('rcrm_session');
                const authObj = authStr ? JSON.parse(authStr) : null;
                if (!authObj || authObj.role !== 'superadmin') {
                    console.error('[API BACKEND REJECT] Tentativa de edição bloqueada: Apenas superadmins alteram superadmins.');
                    throw { status: 403, message: 'Você não tem permissão para gerenciar usuários do tipo superadmin' };
                }
            }
        }
        const records = db.get(col);
        const idx = records.findIndex(r => r.id === id);
        if (idx === -1) return null;

        let finalUpdate = { ...data };
        const now = new Date();

        // SLA Recalculation if priority or category changes
        if (col === 'tickets' && (data.priority || data.category)) {
            const current = records[idx];
            const p = data.priority || current.priority;
            const c = data.category || current.category;
            // Recalculate based on current change date
            const slaRules = calculateSlaDeadlines(p, c, now);
            finalUpdate = { ...finalUpdate, ...slaRules };
        }

        records[idx] = { ...records[idx], ...finalUpdate, updatedAt: now.toISOString() };
        db.set(col, records);
        return records[idx];
    },

    delete(col, id) {
        const records = db.get(col).filter(r => r.id !== id);
        db.set(col, records);
    },

    count(col, predicate) {
        const arr = db.get(col);
        return predicate ? arr.filter(predicate).length : arr.length;
    },

    _uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
    isSeeded() { return localStorage.getItem(DB_PREFIX + 'seeded'); },
    reset() { COLLECTIONS.forEach(c => localStorage.removeItem(db._store(c))); localStorage.removeItem(DB_PREFIX + 'seeded'); },
};

/* ─── Audit Log Helper ─── */
function logAudit(action, details, sessionIn) {
    try {
        const s = sessionIn || JSON.parse(sessionStorage.getItem('rcrm_session') || '{}');
        db.insert('auditlog', {
            action,
            userId: s.userId || 'system',
            userName: s.name || 'Sistema',
            userRole: s.role || '',
            details,
            ip: '127.0.0.1', // client-side only; real IP needs backend
        });
    } catch (e) { /* silent */ }
}

/* Warn user if storage is unavailable (private mode) */
document.addEventListener('DOMContentLoaded', () => {
    if (!db.storageAvailable()) {
        const warn = document.createElement('div');
        warn.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#DA3633;color:#fff;text-align:center;padding:10px;font-size:.85rem;z-index:9999;font-family:Inter,sans-serif';
        warn.textContent = '⚠️ Armazenamento local não disponível. O CRM requer localStorage. Desative o modo privado ou libere as permissões do navegador.';
        document.body?.prepend(warn);
    }
});


/* ─── SLA Config ─── */
const SLA_CONFIG = {
    basico: { label: 'Básico', responseH: 24, resolutionH: 72 },
    empresarial: { label: 'Empresarial', responseH: 8, resolutionH: 24 },
    premium: { label: 'Premium', responseH: 4, resolutionH: 8 },
    emergencial: { label: 'Emergencial', responseH: 2, resolutionH: 4 },
    pmoc: { label: 'PMOC', responseH: 48, resolutionH: 120 }
};

const SLA_MATRIX = [
    { priority: 'critica', category: ['corretiva'], responseH: 48, resolutionH: 60 },
    { priority: 'alta', category: ['corretiva', 'gas'], responseH: 48, resolutionH: 60 },
    { priority: 'media', category: ['higienizacao', 'instalacao'], responseH: 48, resolutionH: 48 },
    { priority: 'baixa', category: ['pmoc', 'outros'], responseH: 72, resolutionH: null }
];

function calculateSlaDeadlines(priority, category, refDate) {
    const p = (priority || '').toLowerCase();
    const c = (category || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Remove acentos
    
    // Mapeamento robusto de categorias
    const catMap = { 
        'manutencao corretiva': 'corretiva', 
        'recarga de gas': 'gas', 
        'instalacao': 'instalacao', 
        'higienizacao': 'higienizacao',
        'pmoc': 'pmoc',
        'outros': 'outros'
    };
    const normalizedCat = catMap[c] || c;

    let rule = SLA_MATRIX.find(r => r.priority === p && r.category.includes(normalizedCat));
    if (!rule) {
        rule = { responseH: 72, resolutionH: 72, unmapped: true };
        console.warn(`[SLA BACKEND] Combinacao nao mapeada: Prioridade '${p}', Categoria '${normalizedCat}'. Aplicando SLA generico (72h).`);
        try { logAudit('sla_fallback', `SLA padrao (72h) acionado para prioridade '${p}' e categoria '${c}'.`); } catch (e) { }
    }

    const responseMs = rule.responseH * 3600_000;
    const resolutionMs = rule.resolutionH ? rule.resolutionH * 3600_000 : null; // null = cronograma

    return {
        slaRefDate: refDate.toISOString(),
        slaResponseDeadline: new Date(refDate.getTime() + responseMs).toISOString(),
        slaResolutionDeadline: resolutionMs ? new Date(refDate.getTime() + resolutionMs).toISOString() : 'cronograma'
    };
}

/* ─── Status helpers ─── */
const TICKET_STATUS = {
    aberto: { label: 'Aberto', badge: 'badge-blue', dot: '#388BFD' },
    andamento: { label: 'Em Andamento', badge: 'badge-yellow', dot: '#D29922' },
    aguardando: { label: 'Aguardando', badge: 'badge-gray', dot: '#8B949E' },
    resolvido: { label: 'Resolvido', badge: 'badge-green', dot: '#2EA043' },
    aguardando_aprovacao: { label: 'Aprovação Orçamento', badge: 'badge-orange', dot: '#FF6B00' },
    aguardando_aprovacao_pecas: { label: 'Aprov. Peças (10 dias)', badge: 'badge-orange', dot: '#FF8A00' },
    fechado: { label: 'Fechado', badge: 'badge-gray', dot: '#484F58' },
    cancelado: { label: 'Cancelado', badge: 'badge-red', dot: '#DA3633' },
};

const PRIORITY = {
    baixa: { label: 'Baixa', badge: 'badge-gray', order: 1 },
    media: { label: 'Média', badge: 'badge-blue', order: 2 },
    alta: { label: 'Alta', badge: 'badge-yellow', order: 3 },
    critica: { label: 'Crítica', badge: 'badge-red', order: 4 },
};

/* ─── SLA Calculator ─── */
function calcSLA(ticket, type = 'resolution') {
    // Legacy support logic removed - strictly uses the new stored deadlines
    const deadlineStr = type === 'resolution' ? ticket.slaResolutionDeadline : ticket.slaResponseDeadline;

    if (deadlineStr === 'cronograma') {
        return {
            isChronogram: true,
            label: 'Conforme Cronograma',
            state: 'ok',
            pct: 0,
            isExpired: false,
            remaining: Infinity
        };
    }

    if (!deadlineStr || !ticket.slaRefDate) {
        return { label: 'Sem SLA', state: 'ok', pct: 0, isExpired: false, remaining: 0 };
    }

    const refMs = new Date(ticket.slaRefDate).getTime();
    const deadlineMs = new Date(deadlineStr).getTime();
    const now = Date.now();
    const totalMs = deadlineMs - refMs;
    const elapsed = now - refMs;
    const remaining = deadlineMs - now;
    const pct = totalMs > 0 ? Math.min(100, Math.round((elapsed / totalMs) * 100)) : 100;

    return {
        deadlineMs,
        remaining,
        pct,
        label: remaining > 0 ? formatDuration(remaining) + ' restante' : 'VENCIDO',
        state: pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'ok',
        isExpired: remaining <= 0,
    };
}

function formatDuration(ms) {
    if (ms <= 0) return 'Vencido';
    const h = Math.floor(ms / 3600_000);
    const m = Math.floor((ms % 3600_000) / 60_000);
    if (h > 24) return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
    return h + 'h ' + m + 'm';
}

/* ─── Seed Data ─── */
function seedDatabase() {
    // Force re-seed if version doesn't match (e.g. new superadmin was added)
    if (db.isSeeded() === SEED_VERSION) return;
    if (db.isSeeded()) {
        // Old seed detected — reset and re-seed silently
        COLLECTIONS.forEach(c => localStorage.removeItem(db._store(c)));
    }

    /* USERS — all emails lowercase to match doLogin() normalization.
       IMPORTANTE: id 'u1' é o Admin (Carlos), id 'u0' é Superadmin (Administrador Master).
       A partir de 2026-07-05 incluímos o Financeiro (read-only no fluxo de aprovação).
       OBS: o seed só roda na primeira vez (SEED_VERSION mismatch = wipe). Para forçar,
       mude SEED_VERSION em cima deste arquivo. */
    const users = [
        { id: 'u0', name: 'Administrador Master', email: 'administrator@renostter.com', password: 'Renostter@', role: 'superadmin', twofa: true },
        { id: 'u1', name: 'Carlos Admin', email: 'admin@renostter.com', password: 'admin123', role: 'admin', twofa: true },
        { id: 'u2', name: 'Marina Silva', email: 'tecnico@renostter.com', password: 'tech123', role: 'tecnico', twofa: false },
        { id: 'u3', name: 'João Empresa', email: 'joao@techcorp.com', password: 'client123', role: 'cliente', clientId: 'c1' },
        { id: 'u4', name: 'Ana Clínica', email: 'ana@clinicaboa.com', password: 'client123', role: 'cliente', clientId: 'c2' },
        { id: 'u5', name: 'Pedro Loja', email: 'pedro@lojacenter.com', password: 'client123', role: 'cliente', clientId: 'c3' },
        { id: 'u6', name: 'Lucas Apt', email: 'lucas@email.com', password: 'client123', role: 'cliente', clientId: 'c4' },
        { id: 'u7', name: 'Beatriz Financeiro', email: 'financeiro@renostter.com', password: 'fin123', role: 'financeiro', twofa: false },
    ];
    db.set('users', users.map(u => ({ ...u, createdAt: randomDate(90) })));


    /* CLIENTS */
    const clients = [
        {
            id: 'c1', razaoSocial: 'TechCorp Desenvolvimento LTDA', fantasia: 'TechCorp', cnpj: '12.345.678/0001-90',
            email: 'joao@techcorp.com', telefone: '(11) 3456-7890', celular: '(11) 99876-5432',
            contato: 'João Empresa', cargo: 'CEO', cep: '01310-100', logradouro: 'Av Paulista', numero: '1000',
            bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP',
            servicos: ['Instalação', 'Manutenção Preventiva', 'PMOC'],
            status: 'ativo', observacoes: 'Cliente premium, atendimento prioritário.', createdAt: randomDate(400)
        },
        {
            id: 'c2', razaoSocial: 'Clínica Boa Saúde ME', fantasia: 'Clínica Boa Saúde', cnpj: '98.765.432/0001-11',
            email: 'ana@clinicaboa.com', telefone: '(11) 2233-4455', celular: '(11) 98765-1234',
            contato: 'Ana Clínica', cargo: 'Administradora', cep: '04038-001', logradouro: 'Av Santo Amaro', numero: '500',
            bairro: 'Campo Belo', cidade: 'São Paulo', uf: 'SP',
            servicos: ['Higienização', 'PMOC', 'Manutenção Corretiva'],
            status: 'ativo', observacoes: 'PMOC obrigatório — vence em março.', createdAt: randomDate(300)
        },
        {
            id: 'c3', razaoSocial: 'Loja Center Comércio LTDA', fantasia: 'Loja Center', cnpj: '11.222.333/0001-44',
            email: 'pedro@lojacenter.com', telefone: '(11) 4444-5555', celular: '(11) 97777-8888',
            contato: 'Pedro Loja', cargo: 'Gerente', cep: '05001-000', logradouro: 'Rua Augusta', numero: '200',
            bairro: 'Consolação', cidade: 'São Paulo', uf: 'SP',
            servicos: ['Instalação', 'Higienização'],
            status: 'ativo', observacoes: '', createdAt: randomDate(200)
        },
        {
            id: 'c4', razaoSocial: 'Lucas Apartamento - CPF', fantasia: 'Lucas Ferreira', cnpj: '333.444.555-66',
            email: 'lucas@email.com', telefone: '', celular: '(11) 91234-5678',
            contato: 'Lucas Ferreira', cargo: '', cep: '05501-000', logradouro: 'Rua das Flores', numero: '42 apt 3',
            bairro: 'Pinheiros', cidade: 'São Paulo', uf: 'SP',
            servicos: ['Manutenção Preventiva'],
            status: 'ativo', observacoes: 'Residencial.', createdAt: randomDate(100)
        },
        {
            id: 'c5', razaoSocial: 'Escritório XYZ LTDA', fantasia: 'XYZ Office', cnpj: '55.666.777/0001-88',
            email: 'contato@xyz.com', telefone: '(11) 3000-1111', celular: '',
            contato: 'Maria Souza', cargo: 'Diretora', cep: '01318-000', logradouro: 'Rua Haddock Lobo', numero: '595',
            bairro: 'Jardins', cidade: 'São Paulo', uf: 'SP',
            servicos: ['Instalação'],
            status: 'inativo', observacoes: 'Contrato encerrado em jan/2025.', createdAt: randomDate(500)
        },
    ];
    db.set('clients', clients);

    /* CONTRACTS */
    const contracts = [
        {
            id: 'ct1', clientId: 'c1', clientName: 'TechCorp', type: 'premium', slaH: '4/8',
            startDate: '2024-01-10', endDate: '2025-01-10', value: 2800, status: 'ativo',
            servicos: ['Instalação', 'Manutenção Preventiva', 'PMOC'], visits: 12,
            bankId: 1, // Cora
            description: 'Contrato anual premium com 12 visitas preventivas.', createdAt: randomDate(365)
        },
        {
            id: 'ct2', clientId: 'c2', clientName: 'Clínica Boa Saúde', type: 'pmoc', slaH: '48/120',
            startDate: '2024-03-01', endDate: '2025-03-01', value: 1500, status: 'ativo',
            servicos: ['PMOC Mensal', 'Higienização Trimestral'], visits: 12,
            bankId: 1, // Cora
            description: 'PMOC mensal conforme ANVISA + Higienização trimestral.', createdAt: randomDate(300)
        },
        {
            id: 'ct3', clientId: 'c3', clientName: 'Loja Center', type: 'empresarial', slaH: '8/24',
            startDate: '2024-06-01', endDate: '2025-06-01', value: 900, status: 'ativo',
            servicos: ['Manutenção Semestral'], visits: 4,
            bankId: 2, // Itaú
            description: 'Manutenção preventiva semestral + suporte.', createdAt: randomDate(200)
        },
    ];
    db.set('contracts', contracts);

    /* TICKETS */
    const now = Date.now();
    const tickets = [
        {
            id: 't1', num: '#00001', clientId: 'c1', clientName: 'TechCorp', contractId: 'ct1', contractType: 'premium',
            title: 'Ar-condicionado da sala de reuniões não está resfriando', category: 'corretiva',
            status: 'aberto', priority: 'alta', assignedTo: 'u2', assignedName: 'Marina Silva',
            description: 'O aparelho liga mas não resfria. Temperatura ambiente 30°C.',
            checklists: [
                { id: 'ck1', text: 'Verificar nível de gás', done: true },
                { id: 'ck2', text: 'Limpar filtros de ar', done: false },
                { id: 'ck3', text: 'Testar compressor', done: false }
            ],
            timeLogs: [],
            slaResponseDeadline: new Date(now - 2 * 3600_000).toISOString(), slaResolutionDeadline: new Date(now - 2 * 3600_000).toISOString(), // vencido
            createdAt: new Date(now - 8 * 3600_000).toISOString(), updatedAt: new Date(now - 3 * 3600_000).toISOString()
        },
        {
            id: 't2', num: '#00002', clientId: 'c2', clientName: 'Clínica Boa Saúde', contractId: 'ct2', contractType: 'pmoc',
            title: 'Solicitação de PMOC — Março 2025', category: 'pmoc',
            status: 'andamento', priority: 'media', assignedTo: 'u2', assignedName: 'Marina Silva',
            description: 'Execução mensal do PMOC conforme contrato. 6 aparelhos.',
            slaResponseDeadline: new Date(now + 24 * 3600_000).toISOString(), slaResolutionDeadline: new Date(now + 24 * 3600_000).toISOString(),
            createdAt: new Date(now - 3 * 24 * 3600_000).toISOString(), updatedAt: new Date(now - 1 * 24 * 3600_000).toISOString()
        },
        {
            id: 't3', num: '#00003', clientId: 'c3', clientName: 'Loja Center', contractId: 'ct3', contractType: 'empresarial',
            title: 'Instalação de 2 splits 18000 BTU', category: 'instalacao',
            status: 'andamento', priority: 'media', assignedTo: 'u2', assignedName: 'Marina Silva',
            description: 'Cliente comprou 2 aparelhos Midea 18000 BTU. Necessita instalação.',
            slaResponseDeadline: new Date(now + 6 * 3600_000).toISOString(), slaResolutionDeadline: new Date(now + 6 * 3600_000).toISOString(),
            createdAt: new Date(now - 2 * 3600_000).toISOString(), updatedAt: new Date(now - 1 * 3600_000).toISOString()
        },
        {
            id: 't4', num: '#00004', clientId: 'c1', clientName: 'TechCorp', contractId: 'ct1', contractType: 'premium',
            title: 'Higienização preventiva — todos os andares', category: 'higienizacao',
            status: 'agendado', priority: 'baixa', assignedTo: 'u2', assignedName: 'Marina Silva',
            description: 'Higienização trimestral programada para 5 aparelhos.',
            slaResponseDeadline: new Date(now + 4 * 24 * 3600_000).toISOString(), slaResolutionDeadline: new Date(now + 4 * 24 * 3600_000).toISOString(),
            createdAt: new Date(now - 5 * 24 * 3600_000).toISOString(), updatedAt: new Date(now - 2 * 24 * 3600_000).toISOString()
        },
        {
            id: 't5', num: '#00005', clientId: 'c4', clientName: 'Lucas Ferreira', contractId: 'ct4', contractType: 'basico',
            title: 'Barulho estranho no aparelho', category: 'corretiva',
            status: 'aguardando', priority: 'media', assignedTo: null, assignedName: null,
            description: 'Aparelho fazendo barulho ao ligar, parece algo preso no ventilador.',
            slaResponseDeadline: new Date(now + 48 * 3600_000).toISOString(), slaResolutionDeadline: new Date(now + 48 * 3600_000).toISOString(),
            createdAt: new Date(now - 1 * 24 * 3600_000).toISOString(), updatedAt: new Date(now - 18 * 3600_000).toISOString()
        },
        {
            id: 't6', num: '#00006', clientId: 'c2', clientName: 'Clínica Boa Saúde', contractId: 'ct2', contractType: 'pmoc',
            title: 'Recarga de gás — consultório 3', category: 'gas',
            status: 'resolvido', priority: 'alta', assignedTo: 'u2', assignedName: 'Marina Silva',
            description: 'Aparelho não resfria. Diagnóstico indicou falta de gás R-410A.',
            slaResponseDeadline: new Date(now - 5 * 24 * 3600_000).toISOString(), slaResolutionDeadline: new Date(now - 5 * 24 * 3600_000).toISOString(),
            closedAt: new Date(now - 6 * 24 * 3600_000).toISOString(),
            csatRating: 5, csatComment: 'Atendimento excelente! Muito profissional.',
            createdAt: new Date(now - 7 * 24 * 3600_000).toISOString(), updatedAt: new Date(now - 6 * 24 * 3600_000).toISOString()
        },
        {
            id: 't7', num: '#00007', clientId: 'c3', clientName: 'Loja Center', contractId: 'ct3', contractType: 'empresarial',
            title: 'Manutenção preventiva semestral', category: 'preventiva',
            status: 'fechado', priority: 'baixa', assignedTo: 'u2', assignedName: 'Marina Silva',
            description: 'Manutenção semestral dos 4 aparelhos da loja.',
            slaResponseDeadline: new Date(now - 10 * 24 * 3600_000).toISOString(), slaResolutionDeadline: new Date(now - 10 * 24 * 3600_000).toISOString(),
            closedAt: new Date(now - 11 * 24 * 3600_000).toISOString(),
            csatRating: 4, csatComment: 'Bom serviço.',
            createdAt: new Date(now - 14 * 24 * 3600_000).toISOString(), updatedAt: new Date(now - 11 * 24 * 3600_000).toISOString()
        },
        {
            id: 't8', num: '#00008', clientId: 'c1', clientName: 'TechCorp', contractId: 'ct1', contractType: 'premium',
            title: 'Aparelho do CPD desligou sozinho', category: 'corretiva',
            status: 'aberto', priority: 'critica', assignedTo: 'u2', assignedName: 'Marina Silva',
            description: 'URGENTE: aparelho do CPD desligou sozinho. Risco de superaquecimento dos servidores.',
            slaResponseDeadline: new Date(now + 1 * 3600_000).toISOString(), slaResolutionDeadline: new Date(now + 1 * 3600_000).toISOString(), // 1h restante
            createdAt: new Date(now - 3 * 3600_000).toISOString(), updatedAt: new Date(now - 2 * 3600_000).toISOString()
        },
    ];
    db.set('tickets', tickets);

    /* COMMENTS */
    const comments = [
        {
            id: 'cm1', ticketId: 't1', authorId: 'u1', authorName: 'Carlos Admin', authorRole: 'admin',
            text: 'Técnica Marina foi acionada para atendimento. ETA: 2h.', internal: false,
            createdAt: new Date(now - 6 * 3600_000).toISOString()
        },
        {
            id: 'cm2', ticketId: 't1', authorId: 'u2', authorName: 'Marina Silva', authorRole: 'tecnico',
            text: '[Nota interna] Parece vazamento de gás. Vou levar kit de recarga.', internal: true,
            createdAt: new Date(now - 4 * 3600_000).toISOString()
        },
        {
            id: 'cm3', ticketId: 't2', authorId: 'u2', authorName: 'Marina Silva', authorRole: 'tecnico',
            text: 'PMOC iniciado. 3 de 6 aparelhos concluídos.', internal: false,
            createdAt: new Date(now - 1 * 24 * 3600_000).toISOString()
        },
        {
            id: 'cm4', ticketId: 't6', authorId: 'u2', authorName: 'Marina Silva', authorRole: 'tecnico',
            text: 'Recarga de 600g de R-410A realizada. Sistema pressurizado e testado. ✅', internal: false,
            createdAt: new Date(now - 6 * 24 * 3600_000).toISOString()
        },
        {
            id: 'cm5', ticketId: 't6', authorId: 'u1', authorName: 'Carlos Admin', authorRole: 'admin',
            text: 'Chamado encerrado. Laudo técnico emitido e enviado por e-mail.', internal: false,
            createdAt: new Date(now - 6 * 24 * 3600_000 + 3600_000).toISOString()
        },
    ];
    db.set('comments', comments);

    /* CSAT */
    const csat = [
        { id: 'cs1', ticketId: 't6', clientId: 'c2', clientName: 'Clínica Boa Saúde', rating: 5, comment: 'Atendimento excelente!', createdAt: new Date(now - 6 * 24 * 3600_000 + 7_200_000).toISOString() },
        { id: 'cs2', ticketId: 't7', clientId: 'c3', clientName: 'Loja Center', rating: 4, comment: 'Bom serviço.', createdAt: new Date(now - 11 * 24 * 3600_000 + 7_200_000).toISOString() },
    ];
    db.set('csat', csat);

    /* NOTIFICATIONS */
    const notifications = [
        { id: 'n1', type: 'sla_risk', title: 'SLA em risco', text: 'Ticket #00001 vence em 2h.', ticketId: 't1', targetUserId: 'u2', read: false, createdAt: new Date(now - 2 * 3600_000).toISOString() },
        { id: 'n2', type: 'sla_expired', title: 'SLA VENCIDO', text: 'Ticket #00001 ultrapassou o prazo!', ticketId: 't1', targetUserId: 'u2', read: false, createdAt: new Date(now - 1 * 3600_000).toISOString() },
        { id: 'n3', type: 'new_ticket', title: 'Novo chamado crítico', text: 'Ticket #00008 — CPD da TechCorp.', ticketId: 't8', targetUserId: 'u2', read: false, createdAt: new Date(now - 3 * 3600_000).toISOString() },
        { id: 'n4', type: 'csat', title: 'Nova avaliação ⭐⭐⭐⭐⭐', text: 'Clínica Boa Saúde avaliou 5 estrelas.', targetUserId: 'u1', read: true, createdAt: new Date(now - 6 * 24 * 3600_000 + 7_200_000).toISOString() },
        { id: 'n5', type: 'transfer', title: '🔄 Chamado transferido para você', text: 'Ticket #00003 foi transferido por Carlos Admin.', ticketId: 't3', targetUserId: 'u2', read: false, createdAt: new Date(now - 5 * 3600_000).toISOString() },
    ];
    db.set('notifications', notifications);

    /* TRANSFERS */
    const transfers = [
        {
            id: 'tr1', ticketId: 't3', ticketNum: '#00003', ticketTitle: 'Instalação de 2 splits 18000 BTU',
            fromUserId: 'u1', fromUserName: 'Carlos Admin',
            toUserId: 'u2', toUserName: 'Marina Silva',
            reason: 'Redistribuição de carga de trabalho — Marina tem experiência em instalações.',
            createdAt: new Date(now - 5 * 3600_000).toISOString()
        },
        {
            id: 'tr2', ticketId: 't1', ticketNum: '#00001', ticketTitle: 'Ar-condicionado da sala de reuniões não está resfriando',
            fromUserId: 'u0', fromUserName: 'Administrador Master',
            toUserId: 'u1', toUserName: 'Carlos Admin',
            reason: 'Chamado complexo requer supervisão administrativa.',
            createdAt: new Date(now - 2 * 24 * 3600_000).toISOString()
        },
    ];
    db.set('transfers', transfers);

    /* AUDIT LOG */
    const auditlog = [
        { id: 'al1', action: 'login', userId: 'u0', userName: 'Administrador Master', userRole: 'superadmin', details: 'Login bem-sucedido via 2FA.', ip: '127.0.0.1', createdAt: new Date(now - 1 * 3600_000).toISOString() },
        { id: 'al2', action: 'login', userId: 'u1', userName: 'Carlos Admin', userRole: 'admin', details: 'Login bem-sucedido via 2FA.', ip: '127.0.0.1', createdAt: new Date(now - 3 * 3600_000).toISOString() },
        { id: 'al3', action: 'transfer', userId: 'u1', userName: 'Carlos Admin', userRole: 'admin', details: 'Transferiu #00003 de Carlos Admin → Marina Silva. Motivo: Redistribuição de carga.', ip: '127.0.0.1', createdAt: new Date(now - 5 * 3600_000).toISOString() },
        { id: 'al4', action: 'password_change', userId: 'u0', userName: 'Administrador Master', userRole: 'superadmin', details: 'Redefinição de senha para usuário: Marina Silva (u2).', ip: '127.0.0.1', createdAt: new Date(now - 2 * 24 * 3600_000).toISOString() },
        { id: 'al5', action: 'login', userId: 'u2', userName: 'Marina Silva', userRole: 'tecnico', details: 'Login bem-sucedido.', ip: '127.0.0.1', createdAt: new Date(now - 6 * 3600_000).toISOString() },
    ];
    db.set('auditlog', auditlog);

    /* DOCUMENTS — metadata only; data field is empty in seed (no real files in demo) */
    const documents = [
        {
            id: 'doc1', clientId: 'c1', clientName: 'TechCorp Solutions',
            name: 'Contrato-TechCorp-2025.pdf', description: 'Contrato de Prestação de Serviços 2025',
            type: 'application/pdf', sizeBytes: 342000,
            data: '', // base64 vazio no seed — arquivos reais são carregados via upload
            uploadedBy: 'u1', uploadedByName: 'Carlos Admin',
            createdAt: new Date(now - 30 * 24 * 3600_000).toISOString(),
            updatedAt: new Date(now - 30 * 24 * 3600_000).toISOString()
        },
        {
            id: 'doc2', clientId: 'c1', clientName: 'TechCorp Solutions',
            name: 'Aditivo-Servicos-2025.pdf', description: 'Aditivo de Serviço — Expansão PMOC',
            type: 'application/pdf', sizeBytes: 156000,
            data: '',
            uploadedBy: 'u0', uploadedByName: 'Administrador Master',
            createdAt: new Date(now - 10 * 24 * 3600_000).toISOString(),
            updatedAt: new Date(now - 10 * 24 * 3600_000).toISOString()
        },
        {
            id: 'doc3', clientId: 'c2', clientName: 'Clínica Boa Saúde',
            name: 'Contrato-BoaSaude-2025.pdf', description: 'Contrato Anual — Manutenção Preventiva',
            type: 'application/pdf', sizeBytes: 278000,
            data: '',
            uploadedBy: 'u1', uploadedByName: 'Carlos Admin',
            createdAt: new Date(now - 45 * 24 * 3600_000).toISOString(),
            updatedAt: new Date(now - 45 * 24 * 3600_000).toISOString()
        },
    ];
    db.set('documents', documents);

    /* SUPPLIERS */
    const suppliers = [
        {
            id: 'sup1', name: 'Frigelar Distribuidora LTDA', cnpj: '12.345.678/0001-01',
            email: 'vendas@frigelar.com.br', phone: '(11) 3344-5566', contactPerson: 'Roberto Frio',
            paymentTerms: '30/60 dias', deliveryDays: 3,
            notes: 'Principal fornecedor de gás e peças de climatização.', status: 'ativo',
            createdAt: new Date(now - 400 * 24 * 3600_000).toISOString()
        },
        {
            id: 'sup2', name: 'Elétrica Total Componentes', cnpj: '98.765.432/0001-02',
            email: 'pedidos@eletricatotal.com', phone: '(11) 4455-6677', contactPerson: 'Sandra Lima',
            paymentTerms: 'À vista com 5% desconto / 30 dias', deliveryDays: 2,
            notes: 'Fornecedor de componentes elétricos, fusíveis, capacitores.', status: 'ativo',
            createdAt: new Date(now - 300 * 24 * 3600_000).toISOString()
        },
        {
            id: 'sup3', name: 'MechParts Indústria e Comércio', cnpj: '55.444.333/0001-03',
            email: 'comercial@mechparts.ind.br', phone: '(11) 5566-7788', contactPerson: 'Fábio Mecânico',
            paymentTerms: '30 dias', deliveryDays: 5,
            notes: 'Peças mecânicas, motores e compressores.', status: 'ativo',
            createdAt: new Date(now - 200 * 24 * 3600_000).toISOString()
        },
    ];
    db.set('suppliers', suppliers);

    /* INVENTORY CATEGORIES */
    const inv_categories = [
        { id: 'cat1', name: 'Eletrônicos', parentId: null, level: 1, active: true },
        { id: 'cat2', name: 'Componentes Elétricos', parentId: 'cat1', level: 2, active: true },
        { id: 'cat3', name: 'Peças Mecânicas', parentId: null, level: 1, active: true },
        { id: 'cat4', name: 'Consumíveis', parentId: null, level: 1, active: true },
    ];
    db.set('inventory_categories', inv_categories);

    /* INVENTORY — products/parts */
    const inventory = [
        {
            id: 'inv1', sku: 'EL001', name: 'Fusível 10A Automotivo', categoryId: 'cat2',
            supplierId: 'sup2', supplierName: 'Elétrica Total Componentes',
            unit: 'un', costPrice: 2.50, salePrice: 5.00,
            location: 'Prateleira A1', description: 'Fusível lâmina 10A para proteção de circuitos elétricos.',
            minStock: 20, safetyStock: 30, currentStock: 45,
            imageBase64: '', status: 'ATIVO',
            createdAt: new Date(now - 180 * 24 * 3600_000).toISOString()
        },
        {
            id: 'inv2', sku: 'EL002', name: 'Capacitor 45+5µF 440V', categoryId: 'cat2',
            supplierId: 'sup2', supplierName: 'Elétrica Total Componentes',
            unit: 'un', costPrice: 28.00, salePrice: 65.00,
            location: 'Prateleira A2', description: 'Capacitor duplo para compressores e motores de ar-condicionado.',
            minStock: 5, safetyStock: 8, currentStock: 3,
            imageBase64: '', status: 'ATIVO',
            createdAt: new Date(now - 150 * 24 * 3600_000).toISOString()
        },
        {
            id: 'inv4', sku: 'GS001', name: 'Gás Refrigerante R-410A (kit 900g)', categoryId: 'cat4',
            supplierId: 'sup1', supplierName: 'Frigelar Distribuidora LTDA',
            unit: 'kit', costPrice: 95.00, salePrice: 200.00,
            location: 'Área de Gases — Prateleira G1', description: 'Kit de recarga R-410A 900g com válvula.',
            minStock: 5, safetyStock: 8, currentStock: 12,
            imageBase64: '', status: 'ATIVO',
            createdAt: new Date(now - 200 * 24 * 3600_000).toISOString()
        }
    ];
    db.set('inventory', inventory);

    /* STOCK MOVEMENTS */
    const stock_movements = [
        // Entradas (compras)
        { id: 'sm1', productId: 'inv1', productName: 'Fusível 10A Automotivo', productSku: 'EL001', type: 'entrada', quantity: 50, balanceAfter: 50, supplierId: 'sup2', supplierName: 'Elétrica Total Componentes', invoiceNumber: 'NF-4521', unitCost: 2.50, ticketId: null, ticketNum: null, technicianId: 'u1', technicianName: 'Carlos Admin', notes: 'Reposição de estoque mensal.', createdAt: new Date(now - 60 * 24 * 3600_000).toISOString(), createdBy: 'u1', createdByName: 'Carlos Admin' },
        { id: 'sm2', productId: 'inv4', productName: 'Gás Refrigerante R-410A (kit 900g)', productSku: 'GS001', type: 'entrada', quantity: 15, balanceAfter: 15, supplierId: 'sup1', supplierName: 'Frigelar Distribuidora LTDA', invoiceNumber: 'NF-8832', unitCost: 95.00, ticketId: null, ticketNum: null, technicianId: 'u1', technicianName: 'Carlos Admin', notes: 'Compra trimestral.', createdAt: new Date(now - 45 * 24 * 3600_000).toISOString(), createdBy: 'u1', createdByName: 'Carlos Admin' },
        { id: 'sm3', productId: 'inv6', productName: 'Motor Ventilador Evaporadora 1/15 CV', productSku: 'MK001', type: 'entrada', quantity: 5, balanceAfter: 5, supplierId: 'sup3', supplierName: 'MechParts Indústria e Comércio', invoiceNumber: 'NF-2244', unitCost: 148.00, ticketId: null, ticketNum: null, technicianId: 'u1', technicianName: 'Carlos Admin', notes: '', createdAt: new Date(now - 40 * 24 * 3600_000).toISOString(), createdBy: 'u1', createdByName: 'Carlos Admin' },
        { id: 'sm4', productId: 'inv2', productName: 'Capacitor 45+5µF 440V', productSku: 'EL002', type: 'entrada', quantity: 10, balanceAfter: 10, supplierId: 'sup2', supplierName: 'Elétrica Total Componentes', invoiceNumber: 'NF-4522', unitCost: 28.00, ticketId: null, ticketNum: null, technicianId: 'u1', technicianName: 'Carlos Admin', notes: 'Reposição urgente.', createdAt: new Date(now - 30 * 24 * 3600_000).toISOString(), createdBy: 'u1', createdByName: 'Carlos Admin' },
        // Saídas vinculadas a chamados
        { id: 'sm5', productId: 'inv4', productName: 'Gás Refrigerante R-410A (kit 900g)', productSku: 'GS001', type: 'saida', quantity: -2, balanceAfter: 13, supplierId: null, supplierName: null, invoiceNumber: null, unitCost: 95.00, ticketId: 't6', ticketNum: '#00006', technicianId: 'u2', technicianName: 'Marina Silva', notes: 'Recarga 600g — consultório 3.', createdAt: new Date(now - 6 * 24 * 3600_000).toISOString(), createdBy: 'u2', createdByName: 'Marina Silva' },
        { id: 'sm6', productId: 'inv2', productName: 'Capacitor 45+5µF 440V', productSku: 'EL002', type: 'saida', quantity: -3, balanceAfter: 7, supplierId: null, supplierName: null, invoiceNumber: null, unitCost: 28.00, ticketId: 't7', ticketNum: '#00007', technicianId: 'u2', technicianName: 'Marina Silva', notes: 'Substituição manutenção Loja Center.', createdAt: new Date(now - 11 * 24 * 3600_000).toISOString(), createdBy: 'u2', createdByName: 'Marina Silva' },
        { id: 'sm7', productId: 'inv1', productName: 'Fusível 10A Automotivo', productSku: 'EL001', type: 'saida', quantity: -5, balanceAfter: 45, supplierId: null, supplierName: null, invoiceNumber: null, unitCost: 2.50, ticketId: 't7', ticketNum: '#00007', technicianId: 'u2', technicianName: 'Marina Silva', notes: 'Fusíveis queimados — troca preventiva.', createdAt: new Date(now - 11 * 24 * 3600_000).toISOString(), createdBy: 'u2', createdByName: 'Marina Silva' },
        { id: 'sm8', productId: 'inv4', productName: 'Gás Refrigerante R-410A (kit 900g)', productSku: 'GS001', type: 'saida', quantity: -1, balanceAfter: 12, supplierId: null, supplierName: null, invoiceNumber: null, unitCost: 95.00, ticketId: 't2', ticketNum: '#00002', technicianId: 'u2', technicianName: 'Marina Silva', notes: 'Complemento de carga gás PMOC.', createdAt: new Date(now - 1 * 24 * 3600_000).toISOString(), createdBy: 'u2', createdByName: 'Marina Silva' },
        { id: 'sm9', productId: 'inv7', productName: 'Filtro de Ar G4 30x30cm', productSku: 'CN001', type: 'saida', quantity: -4, balanceAfter: 8, supplierId: null, supplierName: null, invoiceNumber: null, unitCost: 12.00, ticketId: 't2', ticketNum: '#00002', technicianId: 'u2', technicianName: 'Marina Silva', notes: 'Troca de filtros PMOC — 4 aparelhos.', createdAt: new Date(now - 1 * 24 * 3600_000).toISOString(), createdBy: 'u2', createdByName: 'Marina Silva' },
        // Ajuste de inventário
        { id: 'sm10', productId: 'inv5', productName: 'Gás Refrigerante R-22 (kg)', productSku: 'GS002', type: 'ajuste', quantity: -2, balanceAfter: 1, supplierId: null, supplierName: null, invoiceNumber: null, unitCost: 45.00, ticketId: null, ticketNum: null, technicianId: 'u1', technicianName: 'Carlos Admin', notes: 'Ajuste de inventário — 2kg perdidos por vazamento no cilindro danificado.', createdAt: new Date(now - 15 * 24 * 3600_000).toISOString(), createdBy: 'u1', createdByName: 'Carlos Admin' },
        { id: 'sm11', productId: 'inv2', productName: 'Capacitor 45+5µF 440V', productSku: 'EL002', type: 'saida', quantity: -4, balanceAfter: 3, supplierId: null, supplierName: null, invoiceNumber: null, unitCost: 28.00, ticketId: 't1', ticketNum: '#00001', technicianId: 'u2', technicianName: 'Marina Silva', notes: 'Troca de capacitor — sala de reuniões TechCorp.', createdAt: new Date(now - 5 * 3600_000).toISOString(), createdBy: 'u2', createdByName: 'Marina Silva' },
        { id: 'sm12', productId: 'inv6', productName: 'Motor Ventilador Evaporadora 1/15 CV', productSku: 'MK001', type: 'saida', quantity: -1, balanceAfter: 4, supplierId: null, supplierName: null, invoiceNumber: null, unitCost: 148.00, ticketId: 't3', ticketNum: '#00003', technicianId: 'u2', technicianName: 'Marina Silva', notes: 'Motor queimado — Loja Center instalação.', createdAt: new Date(now - 2 * 3600_000).toISOString(), createdBy: 'u2', createdByName: 'Marina Silva' },
    ];
    db.set('stock_movements', stock_movements);

    /* KNOWLEDGE BASE */
    const knowledge = [
        { id: 'kb1', title: 'Erro E1 em Sprits Midea', category: 'eletronica', content: 'O erro E1 geralmente indica falha na comunicação entre as unidades. Verifique a fiação do sinal (S).', tags: ['Midea', 'Inverter', 'E1'], authorId: 'u0', createdAt: new Date(now - 10 * 24 * 3600_000).toISOString() },
        { id: 'kb2', title: 'Vazamento no Dreno - Causas Comuns', category: 'hidraulica', content: 'Verifique se há obstrução por limo ou se o caimento da tubulação está invertido.', tags: ['Dreno', 'Vazamento', 'Limpeza'], authorId: 'u1', createdAt: new Date(now - 5 * 24 * 3600_000).toISOString() }
    ];
    db.set('knowledge_base', knowledge);

    /* FINANCIAL CATEGORIES */
    const fin_categories = [
        { id: 'fcat1', name: 'Manutenção', type: 'receita', color: '#2EA043' },
        { id: 'fcat2', name: 'Instalação', type: 'receita', color: '#00AEEF' },
        { id: 'fcat3', name: 'Peças', type: 'receita', color: '#FF6B00' },
        { id: 'fcat4', name: 'PMOC', type: 'receita', color: '#8B949E' },
        { id: 'fcat5', name: 'Salários', type: 'despesa', color: '#DA3633' },
        { id: 'fcat6', name: 'Fornecedores', type: 'despesa', color: '#DA3633' },
        { id: 'fcat7', name: 'Impostos', type: 'despesa', color: '#8B949E' },
        { id: 'fcat8', name: 'Aluguel/Contas', type: 'despesa', color: '#DA3633' },
    ];
    db.set('financial_categories', fin_categories);

    /* FINANCIAL TRANSACTIONS */
    const fin_transactions = [
        { id: 'ft1', type: 'receita', description: 'Mensalidade PMOC - TechCorp', value: 2800.00, dueDate: new Date(now).toISOString().split('T')[0], payDate: new Date(now).toISOString().split('T')[0], status: 'pago', clientId: 'c1', categoryId: 'fcat4', contractId: 'ct1' },
        { id: 'ft2', type: 'receita', description: 'Instalação 2 Splits - Loja Center', value: 1800.00, dueDate: new Date(now - 2 * 24 * 3600_000).toISOString().split('T')[0], payDate: new Date(now - 1 * 24 * 3600_000).toISOString().split('T')[0], status: 'pago', clientId: 'c3', categoryId: 'fcat2' },
        { id: 'ft3', type: 'receita', description: 'Manutenção Sala Reunião - TechCorp', value: 450.00, dueDate: new Date(now + 5 * 24 * 3600_000).toISOString().split('T')[0], payDate: null, status: 'pendente', clientId: 'c1', categoryId: 'fcat1', ticketId: 't1' },
        { id: 'ft4', type: 'despesa', description: 'Compra de Gás R-410A - Frigelar', value: 900.00, dueDate: new Date(now - 10 * 24 * 3600_000).toISOString().split('T')[0], payDate: new Date(now - 10 * 24 * 3600_000).toISOString().split('T')[0], status: 'pago', supplierId: 'sup1', categoryId: 'fcat6' },
        { id: 'ft5', type: 'receita', description: 'Consultoria Técnica - Clínica Boa Saúde', value: 12500.00, dueDate: new Date(now - 15 * 24 * 3600_000).toISOString().split('T')[0], payDate: null, status: 'vencido', clientId: 'c2', categoryId: 'fcat1' },
        { id: 'ft6', type: 'receita', description: 'Venda de Peças - TechCorp', value: 33305.00, dueDate: new Date(now - 1 * 24 * 3600_000).toISOString().split('T')[0], payDate: new Date(now - 1 * 24 * 3600_000).toISOString().split('T')[0], status: 'pago', clientId: 'c1', categoryId: 'fcat3' },
    ];
    db.set('financial_transactions', fin_transactions);

    localStorage.setItem(DB_PREFIX + 'seeded', SEED_VERSION);
    console.log('[RCRM] Banco de dados inicializado com dados de demonstração (seed ' + SEED_VERSION + ').');


}

function randomDate(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - Math.floor(Math.random() * daysAgo));
    return d.toISOString();
}

/* Auto-seed na primeira vez */
seedDatabase();

/* ─── Migrações aditivas — SEMPRE executadas (mesmo após seed) ───
   Garante que dados essenciais (ex.: usuário financeiro) existam em qualquer
   banco, sem precisar bumpar SEED_VERSION (que apagaria tudo). */
(function runMigrations() {
    const users = db.get('users');
    if (!Array.isArray(users)) return;

    // 2026-07-05: adicionar role 'financeiro' (read-only no fluxo de aprovação)
    if (!users.find(u => u.email === 'financeiro@renostter.com')) {
        users.push({
            id: 'u7',
            name: 'Beatriz Financeiro',
            email: 'financeiro@renostter.com',
            password: 'fin123',
            role: 'financeiro',
            twofa: false,
            createdAt: new Date().toISOString()
        });
        db.set('users', users);
        console.log('[RCRM] Migração: adicionado usuário financeiro (id u7).');
    }
})();
