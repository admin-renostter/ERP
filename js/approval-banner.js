/**
 * Approval Banner — Banner global de pendências financeiras
 *
 * Aparece como topo de página em qualquer admin/*.html que incluir este script
 * + a chamada `mountApprovalBanner()` no DOMContentLoaded. Mostra a contagem
 * de pendências ativas (PENDING + ESCALATED) com link para /admin/aprovacoes.html.
 *
 * Uso:
 *   <script src="../js/approval-banner.js"></script>
 *   <script>document.addEventListener('DOMContentLoaded', mountApprovalBanner);</script>
 *
 * Segurança:
 *   - Faz fetch com `withCredentials: true` enviando cookie de sessão
 *   - Se role não for admin/superadmin/financeiro, banner não aparece (são as únicas
 *     roles que podem ver a fila de pendências)
 *   - Se API inacessível, silenciosamente não mostra (UX não quebra)
 *
 * Hot-reload: a cada 90s atualiza contagem.
 */

(function () {
    'use strict';

    const API = (typeof CORA_API_URL === 'string') ? CORA_API_URL : 'http://localhost:3000';

    function getSession() {
        if (typeof auth === 'undefined' || !auth.current) return null;
        return auth.current();
    }

    function buildUrl(path) {
        // Tenta resolver base url dinamicamente — se CORA_API_URL estiver no
        // escopo global (cora_integration.js), usa; senão infere da origem.
        try {
            if (typeof CORA_API_URL === 'string' && CORA_API_URL) return new URL(path, CORA_API_URL).toString();
            const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
            return `${isLocal ? 'http' : 'https'}://${window.location.hostname}:${isLocal ? '3000' : ''}${path}`;
        } catch {
            return `/api${path}`;
        }
    }

    async function fetchCount() {
        try {
            const session = getSession();
            if (!session) return null;
            // Roles que veem a fila
            const canSee = ['admin', 'superadmin', 'financeiro'].includes(session.role);
            if (!canSee) return null;

            const res = await fetch(buildUrl('/api/approvals/count'), {
                headers: {
                    'X-User-Id': session.userId || '',
                    'X-User-Name': session.name || '',
                    'X-User-Role': session.role || ''
                }
            });
            if (!res.ok) return null;
            const json = await res.json();
            return json.success ? json.count : null;
        } catch {
            return null;
        }
    }

    function buildBanner(count, tier) {
        const banner = document.createElement('div');
        banner.id = 'approvalGlobalBanner';
        banner.className = 'approval-global-banner';
        banner.setAttribute('role', 'alert');
        banner.setAttribute('aria-live', 'polite');

        // Cor baseada no tier mais urgente
        const style = (count || 0) > 0
            ? 'background:linear-gradient(135deg,rgba(255,107,0,.12),rgba(218,54,51,.08));border:1px solid rgba(255,107,0,.3);color:var(--text-primary, #E6EDF3)'
            : 'background:transparent;border:0;display:none';

        if ((count || 0) === 0) {
            // Sem pendência: não insere nada (mantém DOM limpo)
            return null;
        }

        banner.style.cssText = style + ';'
            + 'padding:14px 20px;border-radius:10px;margin:0 0 20px 0;'
            + 'display:flex;align-items:center;gap:14px;';
        banner.innerHTML = `
            <span style="font-size:1.4rem">⚠️</span>
            <div style="flex:1;line-height:1.3">
                <strong>${count} pendência${count !== 1 ? 's' : ''} financeira${count !== 1 ? 's' : ''}</strong>
                aguardando sua decisão.
                ${tier ? `<span style="font-weight:400;font-size:0.8rem;color:var(--text-secondary,#8B949E)">(${tier})</span>` : ''}
            </div>
            <a href="aprovacoes.html" style="color:var(--blue,#00AEEF);font-weight:600;font-size:0.85rem;text-decoration:none;padding:6px 14px;border:1px solid var(--blue,#00AEEF);border-radius:6px;flex-shrink:0">
                Revisar agora →
            </a>
        `;
        return banner;
    }

    async function mountApprovalBanner() {
        const session = getSession();
        if (!session) return;
        const canSee = ['admin', 'superadmin', 'financeiro'].includes(session.role);
        if (!canSee) return;

        const count = await fetchCount();
        if (!count || count === 0) return;

        // Insere no topo do .page-body (preferencial) ou topo do .main-content
        const anchor = document.querySelector('.page-body, .main-content');
        if (!anchor) return;

        // Se já existir, remove (idempotência)
        const existente = document.getElementById('approvalGlobalBanner');
        if (existente) existente.remove();

        const banner = buildBanner(count, null);
        if (!banner) return;

        // Inserir como primeiro filho do page-body
        anchor.insertBefore(banner, anchor.firstChild);
    }

    // Hot-reload a cada 90s
    let timerId = null;
    function startAutoRefresh() {
        if (timerId) return;
        timerId = setInterval(mountApprovalBanner, 90 * 1000);
    }
    function stopAutoRefresh() {
        if (timerId) clearInterval(timerId);
        timerId = null;
    }

    // API pública
    window.mountApprovalBanner = mountApprovalBanner;
    window.startApprovalAutoRefresh = startAutoRefresh;
    window.stopApprovalAutoRefresh = stopAutoRefresh;

    // Auto-inicialização — basta incluir <script src="../js/approval-banner.js">
    // em qualquer página admin/*.html que tenha o usuário logado com role
    // admin/superadmin/financeiro e o banner aparece sozinho.
    function bootstrap() {
        mountApprovalBanner();
        startAutoRefresh();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
        // DOM já carregado — rodar imediatamente
        setTimeout(bootstrap, 0);
    }
})();
