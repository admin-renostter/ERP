/**
 * routes/consulta.js — consultas de CPF, CNPJ e CEP para preencher cadastros.
 *
 *   GET /api/consulta/cpf/:cpf?consentimento=1   (CPFHub.io — dados pessoais)
 *   GET /api/consulta/cnpj/:cnpj                 (BrasilAPI — dados publicos da empresa)
 *   GET /api/consulta/cep/:cep                   (BrasilAPI, reserva ViaCEP)
 *
 * Resposta de sucesso: { success: true, data: {...}, cache: bool }
 * Resposta de erro:    { success: false, code, error }  com status HTTP:
 *   400 DOC_INVALIDO / SEM_CONSENTIMENTO   404 NAO_ENCONTRADO   429 LIMITE
 *   502 CHAVE_INVALIDA / SERVICO_INDISPONIVEL / FALHA_REDE
 *   503 NAO_CONFIGURADO   504 TEMPO_ESGOTADO
 *
 * LGPD: a consulta de CPF devolve dado pessoal. So a equipe administrativa pode
 * fazer, precisa confirmar que o titular autorizou (consentimento=1), tem limite
 * por usuario e cada consulta fica registrada na auditoria com o CPF mascarado.
 */
const express = require('express');
const { dbRun } = require('../database');
const { requireRole } = require('../middleware/authJWT');
const svc = require('../services/consultaDocumentos');

const router = express.Router();

const STATUS = {
    DOC_INVALIDO: 400, SEM_CONSENTIMENTO: 400, NAO_ENCONTRADO: 404, LIMITE: 429,
    CHAVE_INVALIDA: 502, SERVICO_INDISPONIVEL: 502, FALHA_REDE: 502,
    NAO_CONFIGURADO: 503, TEMPO_ESGOTADO: 504,
};

// Limite por usuario (janela de 1 minuto), separado por tipo de consulta.
const LIMITES = { cpf: 10, cnpj: 30, cep: 60 };
const janelas = new Map(); // "tipo:usuario" -> { inicio, total }
function dentroDoLimite(tipo, usuario) {
    const k = tipo + ':' + usuario, agora = Date.now();
    let j = janelas.get(k);
    if (!j || agora - j.inicio > 60e3) { j = { inicio: agora, total: 0 }; janelas.set(k, j); }
    j.total++;
    if (janelas.size > 5000) janelas.clear();
    return j.total <= LIMITES[tipo];
}

async function auditar(req, acao, doc, resultado) {
    try {
        await dbRun(
            `INSERT INTO logs_auditoria (user_id, user_name, acao, entidade, entidade_id, detalhes_json) VALUES (?, ?, ?, ?, ?, ?)`,
            [req.auditInfo.userId, req.auditInfo.userName || '', acao, 'consulta', svc.mascararDoc(doc), JSON.stringify({ resultado })]
        );
    } catch (e) { console.warn('[consulta] auditoria falhou:', e.message); }
}

function responderErro(res, e, tipo, doc) {
    const code = e.codigo || 'ERRO_INTERNO';
    const status = STATUS[code] || 500;
    // Log sem documento completo e sem a chave da API.
    if (status >= 500) console.warn(`[consulta] ${tipo} ${svc.mascararDoc(doc)} -> ${code}: ${e.message}`);
    if (e.retryAfter) res.setHeader('Retry-After', String(e.retryAfter));
    return res.status(status).json({
        success: false, code,
        error: status === 500 ? 'Erro inesperado na consulta.' : e.message,
    });
}

function rota(tipo, consultar, { exigeConsentimento = false } = {}) {
    return async (req, res) => {
        const doc = svc.soDigitos(req.params.doc);
        try {
            if (exigeConsentimento && !['1', 'true', 'sim'].includes(String(req.query.consentimento || '').toLowerCase())) {
                throw new svc.ConsultaError('SEM_CONSENTIMENTO', 'Confirme que o titular autorizou a consulta do CPF.');
            }
            if (!dentroDoLimite(tipo, req.auditInfo.userId)) {
                throw new svc.ConsultaError('LIMITE', 'Muitas consultas em pouco tempo. Aguarde 1 minuto.', { retryAfter: 60 });
            }
            const { dados, cache } = await consultar(doc);
            if (tipo === 'cpf') await auditar(req, 'consulta_cpf', doc, cache ? 'ok_cache' : 'ok');
            return res.json({ success: true, data: dados, cache });
        } catch (e) {
            if (tipo === 'cpf') await auditar(req, 'consulta_cpf', doc, e.codigo || 'erro');
            return responderErro(res, e, tipo, doc);
        }
    };
}

// CPF: dado pessoal — so admin/superadmin.
router.get('/cpf/:doc', requireRole('admin', 'superadmin'), rota('cpf', svc.consultarCpf, { exigeConsentimento: true }));
// CNPJ e CEP: dados publicos — equipe que cadastra clientes/fornecedores.
router.get('/cnpj/:doc', requireRole('admin', 'superadmin', 'tech', 'financeiro'), rota('cnpj', svc.consultarCnpj));
router.get('/cep/:doc', requireRole('admin', 'superadmin', 'tech', 'financeiro'), rota('cep', svc.consultarCep));

module.exports = router;
