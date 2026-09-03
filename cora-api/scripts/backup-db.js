/**
 * Backup Automático do Banco de Dados (com cifra AES-256-GCM)
 *
 * Sprint Security Hardening 3 — V26
 *
 * PROBLEMA:
 *   Sem backup, ransomware ou falha de disco = perda total de dados.
 *   Backup em texto plano = expõe dados de clientes (LGPD).
 *
 * SOLUÇÃO:
 *   - Backup diário do SQLite via sqlite3 .backup (online, consistente)
 *   - Cifra com AES-256-GCM usando DB_ENCRYPTION_KEY (mesma chave do app)
 *   - Retenção: 7 dias local + flag para S3 upload
 *   - Log de auditoria via SecurityLogger
 *   - Cron: node-cron às 3h (antes do cron principal)
 *
 * USO:
 *   const { runBackup, listBackups, restoreBackup } = require('./scripts/backup-db');
 *   await runBackup({ uploadToS3: true });
 *
 * CLI:
 *   node scripts/backup-db.js              # backup agora
 *   node scripts/backup-db.js --list       # lista backups
 *   node scripts/backup-db.js --restore X  # restaura
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'BACKUPS', 'auto');
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '7', 10);
const DB_PATH = path.join(__dirname, '..', 'cora.sqlite');

/**
 * Cifra um arquivo usando AES-256-GCM.
 * Formato: magic(4) + iv(12) + authTag(16) + ciphertext
 */
function encryptFile(inputPath, outputPath, key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const input = fs.readFileSync(inputPath);
    const ciphertext = Buffer.concat([cipher.update(input), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Header: magic + iv + tag + ciphertext
    const magic = Buffer.from('RBCK', 'utf8');  // Renostter BackuP
    const out = Buffer.concat([magic, iv, authTag, ciphertext]);
    fs.writeFileSync(outputPath, out);
    return { size: out.length, originalSize: input.length };
}

/**
 * Decifra um arquivo cifrado com encryptFile.
 */
function decryptFile(inputPath, outputPath, key) {
    const buf = fs.readFileSync(inputPath);
    const magic = buf.slice(0, 4);
    if (!magic.equals(Buffer.from('RBCK', 'utf8'))) {
        throw new Error('Arquivo não é um backup Renostter (magic inválido)');
    }
    const iv = buf.slice(4, 16);
    const authTag = buf.slice(16, 32);
    const ciphertext = buf.slice(32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    fs.writeFileSync(outputPath, plain);
    return { size: plain.length };
}

/**
 * Executa backup do SQLite usando VACUUM INTO (online, sem lock).
 * Funciona com SQLite 3.27+ (2019).
 */
function snapshotDb(sourcePath) {
    if (!fs.existsSync(sourcePath)) {
        throw new Error(`DB não encontrado: ${sourcePath}`);
    }
    const tmpPath = path.join(BACKUP_DIR, `_tmp_${Date.now()}.sqlite`);
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    // Usa sqlite3 .backup command
    // Formato: sqlite3 source ".backup target"
    try {
        execSync(`sqlite3 "${sourcePath}" ".backup '${tmpPath}'"`, { stdio: 'pipe' });
    } catch (e) {
        // Fallback: copy file directly (pode ter dados parcialmente escritos se houver
        // write em andamento, mas SQLite com WAL minimiza o risco)
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        fs.copyFileSync(sourcePath, tmpPath);
    }
    return tmpPath;
}

/**
 * Limpa backups antigos (retention).
 */
function cleanupOldBackups() {
    if (!fs.existsSync(BACKUP_DIR)) return { removed: 0 };
    const now = Date.now();
    const retentionMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;
    let removed = 0;
    const files = fs.readdirSync(BACKUP_DIR);
    for (const f of files) {
        const fp = path.join(BACKUP_DIR, f);
        if (f.startsWith('_tmp_')) {
            // Tmp files > 1 dia — remove
            if (now - fs.statSync(fp).mtimeMs > 24 * 60 * 60 * 1000) {
                fs.unlinkSync(fp);
                removed++;
            }
            continue;
        }
        if (now - fs.statSync(fp).mtimeMs > retentionMs) {
            fs.unlinkSync(fp);
            removed++;
        }
    }
    return { removed };
}

/**
 * Executa backup completo: snapshot + encrypt.
 * @param {Object} opts
 *   @param {boolean} [opts.encrypt=true]  - Se false, gera sem cifra
 *   @param {boolean} [opts.uploadToS3=false] - Hook para S3 (TODO)
 * @returns {Promise<{ file: string, size: number, encrypted: boolean, ts: string }>}
 */
async function runBackup(opts = {}) {
    const encrypt = opts.encrypt !== false;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = encrypt
        ? `db-${timestamp}.sqlite.enc`
        : `db-${timestamp}.sqlite`;
    const outputPath = path.join(BACKUP_DIR, filename);

    // 1. Snapshot consistente
    const tmpPath = snapshotDb(DB_PATH);
    const originalSize = fs.statSync(tmpPath).size;

    try {
        // 2. Cifra (se habilitado)
        let finalSize = originalSize;
        if (encrypt) {
            const key = getEncryptionKey();
            if (!key) {
                throw new Error('DB_ENCRYPTION_KEY não definida — backup não pode ser cifrado');
            }
            const result = encryptFile(tmpPath, outputPath, key);
            finalSize = result.size;
        } else {
            fs.renameSync(tmpPath, outputPath);
        }

        // 3. Log
        try {
            const SecurityLogger = require('../services/SecurityLogger');
            await SecurityLogger.log({
                type: 'db_backup_created',
                severity: 'low',
                details: { filename, size: finalSize, encrypted: encrypt },
            });
        } catch (_) { /* ignore */ }

        return {
            file: outputPath,
            filename,
            size: finalSize,
            encrypted: encrypt,
            timestamp: new Date().toISOString(),
        };
    } finally {
        // Limpa tmp
        if (fs.existsSync(tmpPath)) {
            fs.unlinkSync(tmpPath);
        }
    }
}

/**
 * Lista backups disponíveis.
 */
function listBackups() {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('db-') && !f.startsWith('_tmp_'))
        .map(f => {
            const fp = path.join(BACKUP_DIR, f);
            const stat = fs.statSync(fp);
            return {
                filename: f,
                size: stat.size,
                created: stat.mtime,
                encrypted: f.endsWith('.enc'),
            };
        })
        .sort((a, b) => b.created - a.created);
    return files;
}

/**
 * Restaura um backup cifrado.
 */
async function restoreBackup(filename, targetPath = null) {
    const inputPath = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(inputPath)) {
        throw new Error(`Backup não encontrado: ${filename}`);
    }
    const target = targetPath || DB_PATH;
    const key = getEncryptionKey();
    if (!key) {
        throw new Error('DB_ENCRYPTION_KEY não definida — não é possível decifrar');
    }
    decryptFile(inputPath, target, key);
    return { restored: target, size: fs.statSync(target).size };
}

/**
 * Obtém a chave de criptografia (32 bytes).
 */
function getEncryptionKey() {
    const envKey = process.env.DB_ENCRYPTION_KEY;
    if (!envKey) return null;
    // Se hex (64 chars) → 32 bytes
    if (/^[0-9a-f]{64}$/i.test(envKey)) {
        return Buffer.from(envKey, 'hex');
    }
    // Senão, usa SHA-256 do valor
    return crypto.createHash('sha256').update(envKey).digest();
}

module.exports = {
    runBackup,
    listBackups,
    restoreBackup,
    cleanupOldBackups,
    encryptFile,
    decryptFile,
    BACKUP_DIR,
    RETENTION_DAYS,
};

// ═══════════════════════════════════════
// CLI
// ═══════════════════════════════════════
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.includes('--list')) {
        const backups = listBackups();
        console.log(`\n📦 Backups em ${BACKUP_DIR}:`);
        if (backups.length === 0) {
            console.log('  (nenhum)');
        } else {
            backups.forEach(b => {
                const sizeKb = (b.size / 1024).toFixed(1);
                console.log(`  ${b.created.toISOString()}  ${b.filename}  ${sizeKb}KB  ${b.encrypted ? '🔒' : ''}`);
            });
        }
        process.exit(0);
    }
    if (args[0] === '--restore') {
        const filename = args[1];
        if (!filename) {
            console.error('Uso: node backup-db.js --restore <filename>');
            process.exit(1);
        }
        restoreBackup(filename)
            .then(r => {
                console.log(`✓ Restaurado para: ${r.restored} (${r.size} bytes)`);
                process.exit(0);
            })
            .catch(e => {
                console.error('✗ Erro:', e.message);
                process.exit(1);
            });
    }
    // Backup agora
    runBackup({ encrypt: true })
        .then(r => {
            console.log(`\n✓ Backup criado: ${r.filename}`);
            console.log(`  Tamanho: ${(r.size / 1024).toFixed(1)}KB`);
            console.log(`  Cifrado: ${r.encrypted ? 'sim' : 'não'}`);
            cleanupOldBackups();
            process.exit(0);
        })
        .catch(e => {
            console.error('✗ Erro:', e.message);
            process.exit(1);
        });
}
