/**
 * Path Validator — Sanitiza paths para evitar path traversal
 *
 * Sprint Security Hardening 3 — V15
 *
 * PROBLEMA RESOLVIDO:
 *   Atacante pode tentar acessar arquivos do sistema operacional via:
 *     - filename = "../../../etc/passwd"
 *     - photoId = "..\\..\\windows\\system32\\config\\SAM"
 *     - key = "documents/../../../etc/shadow"
 *   Se a aplicação concatena paths sem sanitizar, consegue ler/escrever
 *   arquivos arbitrários.
 *
 * SOLUÇÃO:
 *   - Bloquear segmentos "..", "/", "\\" em qualquer input usado como path
 *   - Validar que paths resultantes estão dentro do diretório permitido
 *   - Normalizar antes de comparar
 *
 * USO:
 *   const { sanitizeFilename, isPathSafe, containsTraversal, normalizePath } = require('./middleware/pathValidator');
 *   if (!isPathSafe(userInput)) return res.status(400).json({ error: 'invalid path' });
 *   const safe = sanitizeFilename(userInput);
 */

const path = require('path');

/**
 * Detecta padrões de path traversal em uma string.
 * Considera separadores Unix (/) e Windows (\\).
 */
function containsTraversal(input) {
    if (typeof input !== 'string') return false;
    // Detecta:
    //   - ".." como segmento
    //   - backslashes (Windows)
    //   - null bytes (%00, \0)
    //   - URL-encoded traversal (%2e%2e, %2f, %5c)
    if (input.includes('..') && (
        input.includes('/..') || input.includes('..\\') ||
        input.startsWith('..') || input.endsWith('..')
    )) return true;
    if (/[\x00-\x1f]/.test(input)) return true;  // control chars
    if (/%2e%2e|%2f|%5c/i.test(input)) return true;  // URL-encoded
    if (/\\\\/.test(input)) return true;  // UNC paths
    return false;
}

/**
 * Sanitiza um filename removendo caracteres perigosos.
 * NÃO remove extensão — só caracteres problemáticos.
 */
function sanitizeFilename(input) {
    if (typeof input !== 'string') return '';
    let s = input;
    // Remove path separators
    s = s.replace(/[\/\\]/g, '_');
    // Remove null bytes
    s = s.replace(/\x00/g, '');
    // Remove "..", "./", etc
    s = s.replace(/\.{2,}/g, '_');
    // Remove caracteres de controle
    // eslint-disable-next-line no-control-regex
    s = s.replace(/[\x00-\x1f\x7f]/g, '');
    // Limita comprimento (255 = max em ext4/NTFS)
    if (s.length > 255) {
        const ext = path.extname(s);
        const base = s.slice(0, 255 - ext.length);
        s = base + ext;
    }
    return s;
}

/**
 * Verifica se um path (já normalizado) está dentro de um diretório base.
 * Resolve ambos para absolute path e checa se o target começa com o base.
 *
 * @param {string} baseDir   - Diretório permitido (ex: '/var/app/uploads')
 * @param {string} target    - Path a verificar
 * @returns {boolean}
 */
function isPathSafe(baseDir, target) {
    try {
        const normalizedBase = path.resolve(baseDir);
        const normalizedTarget = path.resolve(target);
        // O target deve estar DENTRO do base
        const relative = path.relative(normalizedBase, normalizedTarget);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            return false;  // saiu do diretório base
        }
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Normaliza e valida um input de path (filename, key, id, etc).
 * Retorna { safe: string, valid: true } ou { safe: null, valid: false, reason: string }.
 */
function normalizePath(input, opts = {}) {
    if (typeof input !== 'string') {
        return { safe: null, valid: false, reason: 'input não é string' };
    }
    if (containsTraversal(input)) {
        return { safe: null, valid: false, reason: 'path traversal detectado (.. ou separadores inválidos)' };
    }
    if (input.length === 0) {
        return { safe: null, valid: false, reason: 'path vazio' };
    }
    if (input.length > (opts.maxLength || 1024)) {
        return { safe: null, valid: false, reason: `path muito longo (max ${opts.maxLength || 1024})` };
    }
    // Sanitiza
    const sanitized = sanitizeFilename(input);
    if (sanitized.length === 0) {
        return { safe: null, valid: false, reason: 'path vazio após sanitização' };
    }
    return { safe: sanitized, valid: true };
}

/**
 * Middleware Express que valida um campo de path no body ou params.
 *
 *   router.post('/upload/:filename',
 *     safePathMiddleware({ from: 'params', field: 'filename' }),
 *     handler
 *   );
 */
function safePathMiddleware(opts = {}) {
    const from = opts.from || 'params';
    const field = opts.field;
    if (!field) throw new Error('[safePathMiddleware] field é obrigatório');
    return (req, res, next) => {
        const value = req[from]?.[field];
        const result = normalizePath(value, opts);
        if (!result.valid) {
            return res.status(400).json({
                success: false,
                error: `Path inválido em ${from}.${field}: ${result.reason}`,
                code: 'INVALID_PATH',
            });
        }
        // Substitui pelo valor sanitizado
        req[from][field] = result.safe;
        next();
    };
}

module.exports = {
    containsTraversal,
    sanitizeFilename,
    isPathSafe,
    normalizePath,
    safePathMiddleware,
};
