/**
 * js/api.js — consultas de CNPJ, CEP e CPF usadas nos cadastros.
 *
 * Tudo passa pelo servidor (/api/consulta/...):
 *   - a CSP do site bloqueia chamadas diretas do navegador para APIs externas;
 *   - a chave do CPFHub fica so no servidor, nunca no navegador.
 * O token da sessao e enviado automaticamente por js/api-auth.js.
 *
 * getCNPJ / getCEP mantem o formato antigo da BrasilAPI (razao_social, street...)
 * para as telas que ja usavam (fornecedores, estoque). Telas novas usam consultar().
 */
const api = {
    CACHE_EXPIRATION: 24 * 60 * 60 * 1000, // 24 horas (so CNPJ e CEP: dados publicos)
    TIMEOUT_MS: 15000,

    /**
     * Consulta generica. tipo: 'cpf' | 'cnpj' | 'cep'.
     * Devolve { ok, data, code, error, status } — nunca lanca excecao.
     * CPF exige opts.consentimento = true (LGPD) e NAO fica guardado no navegador.
     */
    async consultar(tipo, doc, opts) {
        opts = opts || {};
        const limpo = String(doc || '').replace(/\D/g, '');
        const guardar = tipo !== 'cpf';
        if (guardar) {
            const hit = this._getCache('v2_' + tipo + '_' + limpo);
            if (hit) return { ok: true, data: hit, cache: true, status: 200 };
        }
        let url = '/api/consulta/' + tipo + '/' + encodeURIComponent(limpo);
        if (tipo === 'cpf') url += '?consentimento=' + (opts.consentimento ? '1' : '0');
        let resp, corpo = null;
        try {
            const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timer = ctrl ? setTimeout(() => ctrl.abort(), this.TIMEOUT_MS) : null;
            resp = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl ? ctrl.signal : undefined });
            if (timer) clearTimeout(timer);
            try { corpo = await resp.json(); } catch (e) { /* sem corpo JSON */ }
        } catch (err) {
            const tempo = err && err.name === 'AbortError';
            return { ok: false, status: 0, code: tempo ? 'TEMPO_ESGOTADO' : 'FALHA_REDE',
                error: tempo ? 'A consulta demorou demais. Tente de novo.' : 'Sem conexão com o servidor.' };
        }
        if (resp.ok && corpo && corpo.success) {
            if (guardar) this._setCache('v2_' + tipo + '_' + limpo, corpo.data);
            return { ok: true, data: corpo.data, cache: !!corpo.cache, status: resp.status };
        }
        const code = (corpo && corpo.code) || (resp.status === 401 ? 'SESSAO' : resp.status === 403 ? 'SEM_PERMISSAO' : 'ERRO');
        const error = (corpo && corpo.error) ||
            (resp.status === 401 ? 'Sua sessão expirou. Entre de novo.' :
             resp.status === 403 ? 'Seu usuário não tem permissão para esta consulta.' : 'Erro ' + resp.status + ' na consulta.');
        return { ok: false, status: resp.status, code, error };
    },

    /** Formato antigo (BrasilAPI) — usado por fornecedores e estoque. null se falhar. */
    async getCNPJ(cnpj) {
        const r = await this.consultar('cnpj', cnpj);
        if (!r.ok) { console.warn('[api] CNPJ:', r.error); return null; }
        const d = r.data, tel = String(d.telefone || '').replace(/\D/g, '');
        return {
            cnpj: d.cnpj, razao_social: d.razaoSocial, nome_fantasia: d.fantasia,
            descricao_situacao_cadastral: d.situacao, email: d.email, ddd_telefone_1: tel,
            cep: d.cep, logradouro: d.logradouro, numero: d.numero, complemento: d.complemento,
            bairro: d.bairro, municipio: d.cidade, uf: d.uf
        };
    },

    /** Formato antigo (BrasilAPI) — null se falhar. */
    async getCEP(cep) {
        const r = await this.consultar('cep', cep);
        if (!r.ok) { console.warn('[api] CEP:', r.error); return null; }
        const d = r.data;
        return { cep: d.cep, street: d.logradouro, neighborhood: d.bairro, city: d.cidade, state: d.uf };
    },

    /** Mascara para o campo "CNPJ / CPF": ate 11 digitos vira CPF, depois CNPJ. */
    mascararDoc(v) {
        const d = String(v || '').replace(/\D/g, '').slice(0, 14);
        if (d.length <= 11) {
            return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
        }
        return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
            .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
    },

    /** CPF valido (11 digitos, nao repetidos, digitos verificadores corretos). */
    cpfValido(v) {
        const c = String(v || '').replace(/\D/g, '');
        if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
        for (let t = 9; t < 11; t++) {
            let soma = 0;
            for (let i = 0; i < t; i++) soma += Number(c[i]) * (t + 1 - i);
            if (((soma * 10) % 11) % 10 !== Number(c[t])) return false;
        }
        return true;
    },

    /** CNPJ valido (14 digitos, nao repetidos, digitos verificadores corretos). */
    cnpjValido(v) {
        const c = String(v || '').replace(/\D/g, '');
        if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
        const dv = (base) => {
            let peso = base.length - 7, soma = 0;
            for (let i = 0; i < base.length; i++) { soma += Number(base[i]) * peso--; if (peso < 2) peso = 9; }
            const r = soma % 11;
            return r < 2 ? 0 : 11 - r;
        };
        return dv(c.slice(0, 12)) === Number(c[12]) && dv(c.slice(0, 13)) === Number(c[13]);
    },

    _getCache(key) {
        try {
            const item = localStorage.getItem('api_cache_' + key);
            if (!item) return null;
            const parsed = JSON.parse(item);
            if (Date.now() - parsed.timestamp > this.CACHE_EXPIRATION) {
                localStorage.removeItem('api_cache_' + key);
                return null;
            }
            return parsed.data;
        } catch (e) { return null; }
    },

    _setCache(key, data) {
        try {
            localStorage.setItem('api_cache_' + key, JSON.stringify({ timestamp: Date.now(), data: data }));
        } catch (e) { /* armazenamento cheio ou bloqueado: segue sem cache */ }
    }
};
