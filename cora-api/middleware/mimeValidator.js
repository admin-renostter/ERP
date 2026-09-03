/**
 * MIME Validator — Detecta MIME type real via magic bytes (sniff)
 *
 * Sprint Security Hardening 3 — V14
 *
 * PROBLEMA RESOLVIDO:
 *   Atacante pode setar `Content-Type: image/jpeg` no upload mas enviar
 *   um arquivo malicioso (executável, script, shellcode). O servidor confia
 *   no header e armazena — o que pode levar a:
 *     - XSS (se servido como HTML pelo mesmo domínio)
 *     - RCE (se arquivo for executado pelo backend)
 *     - Phishing (HTML que rouba credenciais)
 *     - Bypass de antivirus (extensão não confere com conteúdo)
 *
 * SOLUÇÃO:
 *   - Sniffar os primeiros N bytes (magic numbers) do arquivo
 *   - Comparar com a assinatura esperada para o content-type declarado
 *   - Rejeitar se não bater (claimed ≠ real)
 *
 * Limitações conhecidas:
 *   - Text-based formats (CSV, TXT) não têm magic numbers confiáveis
 *   - ZIP-based formats (DOCX, XLSX) são todos PK\x03\x04 — requer unzip + checar
 *   - SVG é XML — sempre potencialmente perigoso (JavaScript inline)
 *   - PDF tem header %PDF mas também pode ter JS embarcado (XSS via reader)
 *
 * USO:
 *   const { sniffMimeType, validateMime, MIME_SIGNATURES } = require('./middleware/mimeValidator');
 *   const buffer = req.file.buffer; // multer
 *   const claimed = req.body.contentType;
 *   const validation = validateMime(buffer, claimed);
 *   if (!validation.valid) return res.status(400).json({ error: validation.reason });
 */

// Magic bytes (assinaturas) para os tipos mais comuns.
// Cada assinatura é testada nos primeiros N bytes do arquivo.
// [bytes-hex, offset, mask?]
const MAGIC_SIGNATURES = {
    'image/jpeg': [
        // JPEG: FF D8 FF
        { hex: 'FFD8FFE0', offset: 0 },  // JFIF
        { hex: 'FFD8FFE1', offset: 0 },  // EXIF
        { hex: 'FFD8FFE2', offset: 0 },  // Canon
        { hex: 'FFD8FFDB', offset: 0 },  // Samsung
        { hex: 'FFD8FFE3', offset: 0 },
        { hex: 'FFD8FFE8', offset: 0 },  // SPIFF
    ],
    'image/png': [
        { hex: '89504E470D0A1A0A', offset: 0 },  // PNG
    ],
    'image/gif': [
        { hex: '474946383961', offset: 0 },  // GIF89a
        { hex: '474946383761', offset: 0 },  // GIF87a
    ],
    'image/webp': [
        // RIFF + size + WEBP
        { hex: '52494646', offset: 0 },  // RIFF
        { hex: '57454250', offset: 8 },  // WEBP
    ],
    'application/pdf': [
        { hex: '25504446', offset: 0 },  // %PDF
    ],
    'application/zip': [
        { hex: '504B0304', offset: 0 },  // ZIP / DOCX / XLSX / JAR
        { hex: '504B0506', offset: 0 },  // ZIP empty
        { hex: '504B0708', offset: 0 },  // ZIP spanned
    ],
    'application/x-rar-compressed': [
        { hex: '526172211A07', offset: 0 },  // RAR
    ],
    'application/x-7z-compressed': [
        { hex: '377ABCAF271C', offset: 0 },  // 7z
    ],
    'application/gzip': [
        { hex: '1F8B', offset: 0 },
    ],
    'application/x-tar': [
        // Tar: filename (100 bytes) + ... + ustar\0
        { hex: '757374617200', offset: 257 },  // ustar (POSIX)
        { hex: '7573746172', offset: 257 },
    ],
    // DOCX/XLSX/PPTX share ZIP signature — accept same
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
        { hex: '504B0304', offset: 0 },
    ],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
        { hex: '504B0304', offset: 0 },
    ],
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': [
        { hex: '504B0304', offset: 0 },
    ],
    'application/vnd.ms-excel': [
        // OLE2 / XLS: D0 CF 11 E0 A1 B1 1A E1
        { hex: 'D0CF11E0A1B11AE1', offset: 0 },
    ],
    'application/msword': [
        { hex: 'D0CF11E0A1B11AE1', offset: 0 },
    ],
    'image/svg+xml': [
        // SVG é XML — procurar '<?xml' ou '<svg' nos primeiros bytes
        { hex: '3C3F786D6C', offset: 0, match: 'contains' },  // <?xml
        { hex: '3C737667', offset: 0, match: 'contains' },     // <svg
    ],
    'text/plain': [],  // sem magic number — aceita
    'text/csv': [],    // sem magic number — aceita
};

// Tipos que DEVEM ser validados (text/* não tem assinatura confiável)
const VALIDATABLE_TYPES = Object.keys(MAGIC_SIGNATURES).filter(t => MAGIC_SIGNATURES[t].length > 0);

/**
 * Converte string hex (com ou sem espaços) em Buffer
 */
function hexToBuffer(hex) {
    return Buffer.from(hex.replace(/\s+/g, ''), 'hex');
}

/**
 * Compara o buffer do arquivo com uma assinatura
 */
function matchSignature(buffer, sig) {
    if (buffer.length < sig.offset + sig.hex.length / 2) return false;
    const slice = buffer.slice(sig.offset, sig.offset + sig.hex.length / 2);
    const expected = hexToBuffer(sig.hex);
    if (sig.mask) {
        // máscara XOR para ignorar bits (raro)
        for (let i = 0; i < expected.length; i++) {
            if ((slice[i] & sig.mask[i]) !== (expected[i] & sig.mask[i])) return false;
        }
        return true;
    }
    return slice.equals(expected);
}

/**
 * Detecta MIME type real via magic bytes.
 * Retorna { detected, confidence } ou { detected: null, confidence: 'none' }
 *
 * @param {Buffer} buffer - primeiros bytes do arquivo (≥ 512 bytes recomendado)
 * @returns {{ detected: string|null, confidence: 'high'|'medium'|'none' }}
 */
function sniffMimeType(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
        return { detected: null, confidence: 'none' };
    }

    // Testa contra todas as assinaturas conhecidas
    for (const [mime, sigs] of Object.entries(MAGIC_SIGNATURES)) {
        if (sigs.length === 0) continue;  // skip text/*
        for (const sig of sigs) {
            if (matchSignature(buffer, sig)) {
                return { detected: mime, confidence: 'high' };
            }
        }
    }

    // Heurísticas adicionais
    const firstBytes = buffer.slice(0, 512).toString('utf8', 0, 200).trim();
    if (firstBytes.startsWith('<?xml') || firstBytes.startsWith('<svg')) {
        return { detected: 'image/svg+xml', confidence: 'medium' };
    }
    if (firstBytes.startsWith('<!DOCTYPE html') || firstBytes.startsWith('<html')) {
        return { detected: 'text/html', confidence: 'high' };
    }

    return { detected: null, confidence: 'none' };
}

/**
 * Valida se o content-type declarado pelo cliente bate com o MIME real.
 *
 * @param {Buffer} buffer
 * @param {string} claimedContentType - Content-Type do header
 * @returns {{ valid: boolean, claimed: string, detected: string|null, reason?: string }}
 */
function validateMime(buffer, claimedContentType) {
    const claimed = String(claimedContentType || '').toLowerCase().split(';')[0].trim();

    // Tipos text/* sem magic number — aceita por design
    if (claimed.startsWith('text/')) {
        return { valid: true, claimed, detected: 'text', reason: 'text/* sem magic number, aceito' };
    }

    // Tipos sem assinatura esperada — rejeita conservadoramente
    if (!MAGIC_SIGNATURES[claimed]) {
        return {
            valid: false,
            claimed,
            detected: null,
            reason: `Content-Type "${claimed}" não tem validação configurada — adicione à lista de tipos permitidos se for legítimo`,
        };
    }

    // Sniffa o tipo real
    const { detected, confidence } = sniffMimeType(buffer);

    if (detected === null) {
        return {
            valid: false,
            claimed,
            detected: null,
            reason: 'Magic bytes não correspondem a nenhum tipo conhecido — arquivo possivelmente malformado ou malicioso',
        };
    }

    // Verifica correspondência exata ou família
    // (ex: docx, xlsx, pptx são todos ZIP — aceitar se claimed é da família zip)
    const familyMatch = (a, b) => {
        if (a === b) return true;
        // DOCX/XLSX/PPTX compartilham signature ZIP
        const zipFamily = [
            'application/zip',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ];
        if (zipFamily.includes(a) && zipFamily.includes(b)) return true;
        return false;
    };

    if (!familyMatch(claimed, detected)) {
        return {
            valid: false,
            claimed,
            detected,
            reason: `Content-Type declarado (${claimed}) não corresponde ao conteúdo real (${detected}). Possível ataque de MIME spoofing.`,
        };
    }

    return { valid: true, claimed, detected, confidence };
}

/**
 * Middleware Express que valida o body como arquivo.
 * Espera req.body ser { data: base64, contentType: 'image/jpeg' } ou similar.
 *
 *   router.post('/upload',
 *     requireRole('admin', 'superadmin', 'tecnico'),
 *     validateMimeMiddleware({ maxSize: 10 * 1024 * 1024 }),
 *     async (req, res) => { ... }
 *   );
 */
function validateMimeMiddleware(opts = {}) {
    const maxSize = opts.maxSize || 10 * 1024 * 1024; // 10MB
    return (req, res, next) => {
        try {
            const { data, contentType } = req.body || {};
            if (!data) {
                return res.status(400).json({
                    success: false,
                    error: 'data (base64) obrigatório',
                    code: 'MISSING_DATA',
                });
            }
            if (!contentType) {
                return res.status(400).json({
                    success: false,
                    error: 'contentType obrigatório',
                    code: 'MISSING_CONTENT_TYPE',
                });
            }
            // Converte base64 em buffer
            const buffer = Buffer.from(data, 'base64');
            if (buffer.length > maxSize) {
                return res.status(413).json({
                    success: false,
                    error: `arquivo muito grande (${buffer.length} bytes). Máximo: ${maxSize}`,
                    code: 'FILE_TOO_LARGE',
                });
            }
            // Valida MIME
            const result = validateMime(buffer, contentType);
            if (!result.valid) {
                return res.status(400).json({
                    success: false,
                    error: 'MIME validation failed',
                    code: 'INVALID_MIME',
                    details: result,
                });
            }
            // Anexa buffer para o handler
            req.fileBuffer = buffer;
            req.mimeValidation = result;
            next();
        } catch (e) {
            return res.status(400).json({
                success: false,
                error: 'Erro ao processar arquivo',
                code: 'PROCESS_ERROR',
            });
        }
    };
}

module.exports = {
    sniffMimeType,
    validateMime,
    validateMimeMiddleware,
    MAGIC_SIGNATURES,
    VALIDATABLE_TYPES,
};
