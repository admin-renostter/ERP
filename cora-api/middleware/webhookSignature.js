/**
 * Webhook Signature Verification Middleware
 *
 * Verifica a assinatura HMAC-SHA256 dos webhooks recebidos para impedir
 * que requests forjados atualizem cobranças.
 *
 * Hotfix Camada 1 — versão "mínimo viável":
 *   - Lê o secret configurado em WEBHOOK_WEBHOOK_SECRET (env) ou do banco
 *   - Calcula HMAC-SHA256 do body raw
 *   - Compara em timing-safe com o header X-Cora-Signature (aceita hex ou base64)
 *   - Em modo dev (NODE_ENV != production), permite bypass via WEBHOOK_SIGNATURE_BYPASS=true
 *
 * Limitações conhecidas (resolver na Camada 2):
 *   - Usa secret único global; o ideal é secret por banco cadastrado
 *   - Não valida timestamp / janela de replay
 *   - Não tem rotação de chaves
 *
 * Uso:
 *   app.post('/api/cobrancas/webhook', verifyWebhookSignature({ required: true }), handler)
 */

const crypto = require('crypto');

function timingSafeEqualHex(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
    } catch {
        return false;
    }
}

/**
 * Middleware factory
 * @param {Object} opts
 * @param {boolean} [opts.required=true] - Se true, bloqueia request sem assinatura válida em prod
 * @param {string} [opts.secret] - Secret HMAC (default: env WEBHOOK_WEBHOOK_SECRET)
 * @param {string} [opts.headerName] - Nome do header (default: x-cora-signature)
 */
function verifyWebhookSignature(opts = {}) {
    const required = opts.required !== false;
    const headerName = (opts.headerName || 'x-cora-signature').toLowerCase();
    // SECURITY FIX V04: janela de replay attack
    const REPLAY_WINDOW_SEC = parseInt(process.env.WEBHOOK_REPLAY_WINDOW_SEC || '300');  // 5 min

    return (req, res, next) => {
        const isProd = process.env.NODE_ENV === 'production';
        const bypass = process.env.WEBHOOK_SIGNATURE_BYPASS === 'true';
        const secret = opts.secret || process.env.WEBHOOK_WEBHOOK_SECRET;

        // Em dev + bypass explícito, deixa passar (útil para testes E2E locais)
        if (!isProd && bypass) {
            return next();
        }

        if (!secret) {
            if (required && isProd) {
                console.error('[Webhook] WEBHOOK_WEBHOOK_SECRET não configurado em produção — bloqueando.');
                return res.status(500).json({ success: false, error: 'Webhook secret não configurado' });
            }
            // Em dev sem secret configurado, apenas avisa
            console.warn('[Webhook] WEBHOOK_WEBHOOK_SECRET ausente — verificação desabilitada (apenas dev).');
            return next();
        }

        const signature = req.headers[headerName] || req.headers['x-signature'];
        if (!signature) {
            if (required || isProd) {
                return res.status(401).json({ success: false, error: 'Assinatura ausente' });
            }
            return next();
        }

        // Body raw capturado pelo middleware express.json({ verify })
        const rawBody = req.rawBody;
        if (!rawBody) {
            return res.status(400).json({ success: false, error: 'Body não disponível para verificação' });
        }

        const sigStr = String(signature);

        // SECURITY FIX V04: formato "t=<timestamp>,v1=<hex>"
        // - t=1234567890: timestamp unix (segundos)
        // - v1=abc123...: HMAC-SHA256(`${t}.${rawBody}`, secret)
        // Aceita também formato antigo "sha256=..." (sem timestamp, sem anti-replay)
        const tsMatch = sigStr.match(/t=(\d+)/);
        const v1Match = sigStr.match(/v1=([a-f0-9]+)/i);

        let expectedHex, cleanSig, timestamp;
        if (tsMatch && v1Match) {
            // Formato novo com anti-replay
            timestamp = parseInt(tsMatch[1]);
            cleanSig = v1Match[1];
            const signedPayload = `${tsMatch[1]}.${rawBody}`;
            expectedHex = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

            // Janela de replay
            const now = Math.floor(Date.now() / 1000);
            if (Math.abs(now - timestamp) > REPLAY_WINDOW_SEC) {
                console.warn(`[Webhook] Timestamp fora da janela (${Math.abs(now - timestamp)}s, IP: ${req.ip})`);
                return res.status(401).json({ success: false, error: 'Timestamp fora da janela' });
            }
        } else {
            // Formato antigo (compat): apenas HMAC do body
            const cleaned = sigStr.replace(/^(sha256=|v1=)/i, '').trim();
            cleanSig = cleaned;
            expectedHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
        }

        const expectedB64 = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');

        const ok = timingSafeEqualHex(cleanSig.toLowerCase(), expectedHex.toLowerCase())
            || cleanSig === expectedB64;

        if (!ok) {
            console.warn(`[Webhook] Assinatura inválida recebida (IP: ${req.ip})`);
            return res.status(401).json({ success: false, error: 'Assinatura inválida' });
        }

        next();
    };
}

module.exports = { verifyWebhookSignature };