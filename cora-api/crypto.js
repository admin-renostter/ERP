/**
 * Utility for secure data encryption (AES-256-GCM)
 * Used for sensitive API credentials (e.g. Cora client_secret).
 *
 * Sprint 0 — Segurança Crítica
 *
 * Mudanças:
 *   - Fail-fast em produção se DB_ENCRYPTION_KEY não estiver configurada
 *     ou tiver valor default conhecido.
 *   - Mantém compat com dev (usa fallback APENAS em dev).
 *   - decrypt() lança erro explícito se a chave mudar (re-encrypt necessário).
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Valores default NUNCA aceitos em produção. Mesmo conceito do envValidator.
const KNOWN_INSECURE_DEFAULTS = [
    'renostter_super_secret_key_32bytes!',
    'change_me',
    'secret',
    'default',
];

function getEncryptionKey() {
    const raw = process.env.DB_ENCRYPTION_KEY;
    const isProd = process.env.NODE_ENV === 'production';

    if (!raw) {
        if (isProd) {
            throw new Error(
                '[Crypto] DB_ENCRYPTION_KEY não configurada em produção. ' +
                'Defina a env var (≥ 32 bytes) e reinicie. Veja SECURITY.md.'
            );
        }
        console.warn('[Crypto] DB_ENCRYPTION_KEY ausente em dev — usando chave fraca. NÃO USE EM PRODUÇÃO.');
        return Buffer.from('renostter_super_secret_key_32bytes!', 'utf8').slice(0, 32);
    }

    if (isProd && KNOWN_INSECURE_DEFAULTS.includes(String(raw).trim())) {
        throw new Error(
            '[Crypto] DB_ENCRYPTION_KEY com valor default conhecido em produção. ' +
            'Rotacione IMEDIATAMENTE. Veja SECURITY.md §2.2.'
        );
    }

    return Buffer.from(raw, 'utf8').slice(0, 32);
}

function encrypt(text) {
    if (!text) return null;

    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(encryptedText) {
    if (!encryptedText) return null;

    const key = getEncryptionKey();
    try {
        const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
        if (!ivHex || !authTagHex || !encrypted) {
            throw new Error('Formato de payload criptografado inválido (esperado iv:authTag:encrypted)');
        }
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');

        if (iv.length !== IV_LENGTH) {
            throw new Error(`IV com tamanho inválido: ${iv.length} (esperado ${IV_LENGTH})`);
        }
        if (authTag.length !== AUTH_TAG_LENGTH) {
            throw new Error(`Auth tag com tamanho inválido: ${authTag.length} (esperado ${AUTH_TAG_LENGTH})`);
        }

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        // Se a chave mudou desde o encrypt, GCM falha no setAuthTag ou final.
        // Em prod, falhamos ruidosamente. Em dev, só logamos.
        if (process.env.NODE_ENV === 'production') {
            console.error('[Crypto] Decryption failed:', error.message, '— provável chave rotacionada sem re-encrypt.');
            throw error;
        }
        console.error('[Crypto] Decryption failed:', error.message);
        return null;
    }
}

module.exports = { encrypt, decrypt };
