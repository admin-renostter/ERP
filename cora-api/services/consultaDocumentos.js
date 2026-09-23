/**
 * services/consultaDocumentos.js — consulta CPF (CPFHub.io), CNPJ e CEP (BrasilAPI,
 * com ViaCEP como reserva) pelo SERVIDOR.
 *
 * Por que no servidor:
 *   - a chave do CPFHub nunca vai para o navegador nem para o Git
 *     (fica so na variavel de ambiente CPFHUB_API_KEY);
 *   - a CSP do site so deixa o navegador falar com o proprio site
 *     (connect-src 'self'), entao chamadas diretas a APIs externas sao bloqueadas.
 *
 * Tudo aqui devolve objetos ja "traduzidos" para os nomes que o ERP usa.
 * Erros viram ConsultaError com um codigo estavel (ver CODIGOS abaixo), que a
 * rota converte em status HTTP e mensagem em portugues.
 */
const crypto = require('crypto');

// ─────────────────────────── Configuracao ───────────────────────────
const CFG = {
    cpfhubUrl: (process.env.CPFHUB_API_URL || 'https://api.cpfhub.io').replace(/\/+$/, ''),
    // Plano gratuito: 1 requisicao a cada 2 s. Pro: 1 por segundo.
    cpfhubIntervaloMs: parseInt(process.env.CPFHUB_MIN_INTERVAL_MS, 10) || 2000,
    brasilApiUrl: (process.env.BRASILAPI_URL || 'https://brasilapi.com.br').replace(/\/+$/, ''),
    viaCepUrl: (process.env.VIACEP_URL || 'https://viacep.com.br').replace(/\/+$/, ''),
    timeoutMs: parseInt(process.env.CONSULTA_TIMEOUT_MS, 10) || 8000,
};
// Lida a cada chamada (permite configurar sem reiniciar em testes).
function chaveCpfHub() { return (process.env.CPFHUB_API_KEY || '').trim(); }

// ─────────────────────────── Erros ───────────────────────────
class ConsultaError extends Error {
    constructor(codigo, mensagem, extra) {
        super(mensagem);
        this.codigo = codigo;
        Object.assign(this, extra || {});
    }
}

// ─────────────────────────── Validacao de documentos ───────────────────────────
function soDigitos(v) { return String(v || '').replace(/\D/g, ''); }

/** CPF: 11 digitos, nao repetidos, com os 2 digitos verificadores corretos. */
function cpfValido(v) {
    const c = soDigitos(v);
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    for (let t = 9; t < 11; t++) {
        let soma = 0;
        for (let i = 0; i < t; i++) soma += Number(c[i]) * (t + 1 - i);
        const dv = ((soma * 10) % 11) % 10;
        if (dv !== Number(c[t])) return false;
    }
    return true;
}

/** CNPJ: 14 digitos, nao repetidos, com os 2 digitos verificadores corretos. */
function cnpjValido(v) {
    const c = soDigitos(v);
    if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
    const calc = (base) => {
        const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
        const soma = pesos.reduce((s, p, i) => s + Number(base[i]) * p, 0);
        const r = soma % 11;
        return r < 2 ? 0 : 11 - r;
    };
    return calc(c.slice(0, 12)) === Number(c[12]) && calc(c.slice(0, 13)) === Number(c[13]);
}

function cepValido(v) { return /^\d{8}$/.test(soDigitos(v)); }

/** Para logs e auditoria: nunca gravar o documento inteiro. */
function mascararDoc(v) {
    const c = soDigitos(v);
    if (c.length === 11) return `***.${c.slice(3, 6)}.${c.slice(6, 9)}-**`;
    if (c.length === 14) return `${c.slice(0, 2)}.***.***/${c.slice(8, 12)}-**`;
    return '***';
}

// ─────────────────────────── Cache em memoria ───────────────────────────
// Guarda respostas por um tempo para nao gastar consultas (o plano gratuito do
// CPFHub tem 50 por mes). Chave = hash do documento, nao o documento em si.
// Para varias instancias do servidor, trocar por Redis (infra/redis.js).
const CACHE_MAX = 2000;
const cache = new Map(); // chave -> { expira, valor }
function chaveCache(tipo, doc) { return tipo + ':' + crypto.createHash('sha256').update(doc).digest('hex').slice(0, 32); }
function cacheGet(k) {
    const e = cache.get(k);
    if (!e) return undefined;
    if (Date.now() > e.expira) { cache.delete(k); return undefined; }
    return e.valor;
}
function cacheSet(k, valor, ttlMs) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value); // remove o mais antigo
    cache.set(k, { expira: Date.now() + ttlMs, valor });
}
const TTL = {
    cpf: 12 * 3600e3, cnpj: 24 * 3600e3, cep: 7 * 24 * 3600e3,
    naoEncontrado: 30 * 60e3, // "nao encontrado" tambem fica guardado por 30 min
};

// Mesma consulta ja em andamento? Reaproveita a promessa em vez de chamar de novo.
const emAndamento = new Map();
async function comCache(tipo, doc, ttl, buscar) {
    const k = chaveCache(tipo, doc);
    const hit = cacheGet(k);
    if (hit !== undefined) {
        if (hit && hit.__naoEncontrado) throw new ConsultaError('NAO_ENCONTRADO', hit.mensagem);
        return { dados: hit, cache: true };
    }
    if (emAndamento.has(k)) return { dados: await emAndamento.get(k), cache: true };
    const p = (async () => {
        try {
            const dados = await buscar();
            cacheSet(k, dados, ttl);
            return dados;
        } catch (e) {
            if (e.codigo === 'NAO_ENCONTRADO') cacheSet(k, { __naoEncontrado: true, mensagem: e.message }, TTL.naoEncontrado);
            throw e;
        } finally { emAndamento.delete(k); }
    })();
    emAndamento.set(k, p);
    return { dados: await p, cache: false };
}

// ─────────────────────────── HTTP ───────────────────────────
async function httpJson(url, headers, fonte) {
    let r;
    try 
    const requestHeaders = Object.assign({
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate, br',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}, headers || {});
r = await fetch(url, { 
    headers: requestHeaders,
    signal: AbortSignal.timeout(CFG.timeoutMs)
});
    catch (e) {
        if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
            throw new ConsultaError('TEMPO_ESGOTADO', `O serviço ${fonte} demorou demais para responder.`);
        }
        throw new ConsultaError('FALHA_REDE', `Não foi possível falar com o serviço ${fonte}.`);
    }
    let corpo = null;
    try { corpo = await r.json(); } catch (_) { /* resposta sem JSON */ }
    return { status: r.status, corpo, retryAfter: r.headers.get('retry-after') };
}

/** Traduz o status HTTP da API externa para um erro nosso. */
function erroPorStatus(status, fonte, retryAfter) {
    if (status === 404) return new ConsultaError('NAO_ENCONTRADO', 'Documento não encontrado na base consultada.');
    if (status === 400 || status === 422) return new ConsultaError('DOC_INVALIDO', 'O serviço recusou o documento informado.');
    if (status === 401 || status === 403) return new ConsultaError('CHAVE_INVALIDA', `A chave de acesso do ${fonte} foi recusada. Verifique a configuração do servidor.`);
    if (status === 429) return new ConsultaError('LIMITE', `Limite de consultas do ${fonte} atingido. Tente mais tarde.`, { retryAfter: parseInt(retryAfter, 10) || null });
    return new ConsultaError('SERVICO_INDISPONIVEL', `O serviço ${fonte} está com problemas (erro ${status}). Tente mais tarde.`);
}

// ─────────────────────────── CPF (CPFHub.io) ───────────────────────────
// Respeita o intervalo minimo entre chamadas do plano (fila simples).
let proximaLiberacao = 0;
async function aguardarVezCpfHub() {
    const agora = Date.now();
    const espera = Math.max(0, proximaLiberacao - agora);
    if (espera > 3 * CFG.cpfhubIntervaloMs) {
        throw new ConsultaError('LIMITE', 'Muitas consultas de CPF ao mesmo tempo. Aguarde alguns segundos.', { retryAfter: Math.ceil(espera / 1000) });
    }
    proximaLiberacao = Math.max(agora, proximaLiberacao) + CFG.cpfhubIntervaloMs;
    if (espera) await new Promise(r => setTimeout(r, espera));
}

/** "15/06/1990" ou "1990-06-15" -> "1990-06-15" (formato de <input type="date">). */
function dataIso(v, d) {
    if (d && d.year && d.month && d.day) return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
    const s = String(v || '');
    let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * Mapeia a resposta do CPFHub. Formato documentado:
 *   { success: true, data: { cpf, name, nameUpper, gender, birthDate: "dd/mm/aaaa", day, month, year } }
 * O mapeamento aceita nomes alternativos caso a API mude — ajustar conforme resposta real da API.
 */
function mapearCpfHub(corpo, cpf) {
    const d = (corpo && (corpo.data || corpo.result || corpo)) || {};
    const nome = d.name || d.nome || d.nameUpper || null;
    if (!nome) return null;
    const g = String(d.gender || d.genero || d.sexo || '').trim().toUpperCase();
    return {
        cpf,
        nome: String(nome).trim(),
        nascimento: dataIso(d.birthDate || d.dataNascimento || d.nascimento, d),
        genero: g.startsWith('M') ? 'M' : g.startsWith('F') ? 'F' : null,
    };
}

async function consultarCpf(cpfBruto) {
    const cpf = soDigitos(cpfBruto);
    if (!cpfValido(cpf)) throw new ConsultaError('DOC_INVALIDO', 'CPF inválido. Confira os números digitados.');
    if (!chaveCpfHub()) throw new ConsultaError('NAO_CONFIGURADO', 'A consulta de CPF ainda não foi configurada no servidor (falta a chave CPFHUB_API_KEY).');
    return comCache('cpf', cpf, TTL.cpf, async () => {
        await aguardarVezCpfHub();
        const r = await httpJson(`${CFG.cpfhubUrl}/cpf/${cpf}`, { 'x-api-key': chaveCpfHub() }, 'CPFHub');
        if (r.status !== 200) throw erroPorStatus(r.status, 'CPFHub', r.retryAfter);
        if (r.corpo && r.corpo.success === false) throw new ConsultaError('NAO_ENCONTRADO', 'CPF não encontrado na base consultada.');
        const dados = mapearCpfHub(r.corpo, cpf);
        if (!dados) throw new ConsultaError('NAO_ENCONTRADO', 'CPF não encontrado na base consultada.');
        return dados;
    });
}

// ─────────────────────────── CNPJ (BrasilAPI) ───────────────────────────
function telefoneBr(v) {
    const t = soDigitos(v);
    if (t.length < 10) return t || null;
    return `(${t.slice(0, 2)}) ${t.slice(2, t.length - 4)}-${t.slice(-4)}`;
}
function mapearCnpj(d, cnpj) {
    if (!d || !d.razao_social) return null;
    return {
        cnpj,
        razaoSocial: d.razao_social || null,
        fantasia: d.nome_fantasia || null,
        situacao: d.descricao_situacao_cadastral || null,
        email: d.email ? String(d.email).toLowerCase() : null,
        telefone: telefoneBr(d.ddd_telefone_1),
        cep: soDigitos(d.cep) || null,
        logradouro: [d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(' ') || null,
        numero: d.numero || null,
        complemento: d.complemento || null,
        bairro: d.bairro || null,
        cidade: d.municipio || null,
        uf: d.uf || null,
    };
}
async function consultarCnpj(cnpjBruto) {
    const cnpj = soDigitos(cnpjBruto);
    if (!cnpjValido(cnpj)) throw new ConsultaError('DOC_INVALIDO', 'CNPJ inválido. Confira os números digitados.');
    return comCache('cnpj', cnpj, TTL.cnpj, async () => {
        const r = await httpJson(`${CFG.brasilApiUrl}/api/cnpj/v1/${cnpj}`, null, 'BrasilAPI');
        if (r.status !== 200) throw erroPorStatus(r.status, 'BrasilAPI', r.retryAfter);
        const dados = mapearCnpj(r.corpo, cnpj);
        if (!dados) throw new ConsultaError('NAO_ENCONTRADO', 'CNPJ não encontrado na Receita Federal.');
        return dados;
    });
}

// ─────────────────────────── CEP (BrasilAPI, reserva ViaCEP) ───────────────────────────
async function consultarCep(cepBruto) {
    const cep = soDigitos(cepBruto);
    if (!cepValido(cep)) throw new ConsultaError('DOC_INVALIDO', 'CEP inválido. Use 8 números.');
    return comCache('cep', cep, TTL.cep, async () => {
        let falha;
        try {
            const r = await httpJson(`${CFG.brasilApiUrl}/api/cep/v1/${cep}`, null, 'BrasilAPI');
            if (r.status === 200 && r.corpo && r.corpo.city) {
                const d = r.corpo;
                return { cep, logradouro: d.street || null, bairro: d.neighborhood || null, cidade: d.city || null, uf: d.state || null, fonte: 'brasilapi' };
            }
            falha = erroPorStatus(r.status === 200 ? 404 : r.status, 'BrasilAPI');
        } catch (e) { falha = e; }
        // Reserva: ViaCEP
        const v = await httpJson(`${CFG.viaCepUrl}/ws/${cep}/json/`, null, 'ViaCEP').catch(() => null);
        if (v && v.status === 200 && v.corpo && !v.corpo.erro && v.corpo.localidade) {
            const d = v.corpo;
            return { cep, logradouro: d.logradouro || null, bairro: d.bairro || null, cidade: d.localidade || null, uf: d.uf || null, fonte: 'viacep' };
        }
        throw falha.codigo ? falha : new ConsultaError('NAO_ENCONTRADO', 'CEP não encontrado.');
    });
}

function _limparCache() { cache.clear(); emAndamento.clear(); proximaLiberacao = 0; }

module.exports = {
    consultarCpf, consultarCnpj, consultarCep,
    cpfValido, cnpjValido, cepValido, mascararDoc, soDigitos,
    ConsultaError, _limparCache, _mapearCpfHub: mapearCpfHub,
};
