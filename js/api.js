/**
 * BrasilAPI client with local caching
 */
const api = {
    CACHE_EXPIRATION: 24 * 60 * 60 * 1000, // 24 hours

    async getCNPJ(cnpj) {
        const cleanCnpj = cnpj.replace(/\D/g, '');
        if (cleanCnpj.length !== 14) return null;

        const cached = parseFloat(this._getCache('cnpj_' + cleanCnpj));
        if (cached) return cached;

        try {
            const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
            if (!resp.ok) throw new Error('API Error');
            const data = await resp.json();
            this._setCache('cnpj_' + cleanCnpj, data);
            return data;
        } catch (err) {
            console.error('BrasilAPI CNPJ Error:', err);
            return null;
        }
    },

    async getCEP(cep) {
        const cleanCep = cep.replace(/\D/g, '');
        if (cleanCep.length !== 8) return null;

        const cached = this._getCache('cep_' + cleanCep);
        if (cached) return cached;

        try {
            const resp = await fetch(`https://brasilapi.com.br/api/cep/v1/${cleanCep}`);
            if (!resp.ok) throw new Error('API Error');
            const data = await resp.json();
            this._setCache('cep_' + cleanCep, data);
            return data;
        } catch (err) {
            console.error('BrasilAPI CEP Error:', err);
            return null;
        }
    },

    _getCache(key) {
        const item = localStorage.getItem('api_cache_' + key);
        if (!item) return null;
        const parsed = JSON.parse(item);
        if (Date.now() - parsed.timestamp > this.CACHE_EXPIRATION) {
            localStorage.removeItem('api_cache_' + key);
            return null;
        }
        return parsed.data;
    },

    _setCache(key, data) {
        localStorage.setItem('api_cache_' + key, JSON.stringify({
            timestamp: Date.now(),
            data: data
        }));
    }
};
