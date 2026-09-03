/**
 * Seed Users — Cria/atualiza usuários padrão com senhas bcrypt
 *
 * Sprint 0 — Segurança Crítica
 *
 * Uso:
 *   node cora-api/scripts/seed-users.js              # cria com senha padrão
 *   node cora-api/scripts/seed-users.js --force      # atualiza mesmo se existir
 *   node cora-api/scripts/seed-users.js --password=X # senha customizada
 *
 * Senha padrão (dev): "Renostter@2026"
 * Em produção, RODE COM --password e troque IMEDIATAMENTE após o seed.
 */

const bcrypt = require('bcryptjs');
const path = require('path');
const { dbGet, dbRun, dbAll } = require('../database');

const SALT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);

const DEFAULT_USERS = [
    {
        id: 'usr-admin-001',
        username: 'admin',
        email: 'admin@renostter.com',
        nome: 'Administrador',
        role: 'admin',
        client_id: null,
    },
    {
        id: 'usr-super-001',
        username: 'superadmin',
        email: 'superadmin@renostter.com',
        nome: 'Super Administrador',
        role: 'superadmin',
        client_id: null,
    },
    {
        id: 'usr-finan-001',
        username: 'financeiro',
        email: 'financeiro@renostter.com',
        nome: 'Financeiro',
        role: 'financeiro',
        client_id: null,
    },
    {
        id: 'usr-tec-001',
        username: 'tecnico',
        email: 'tecnico@renostter.com',
        nome: 'Técnico Teste',
        role: 'tecnico',
        client_id: null,
    },
    {
        id: 'usr-cli-001',
        username: 'cliente',
        email: 'cliente@renostter.com',
        nome: 'Cliente Teste',
        role: 'cliente',
        client_id: 'cli-teste-001',
    },
];

async function getCustomPassword() {
    const arg = process.argv.find(a => a.startsWith('--password='));
    if (arg) return arg.split('=')[1];
    return process.env.SEED_PASSWORD || 'Renostter@2026';
}

async function run() {
    const force = process.argv.includes('--force');
    const password = await getCustomPassword();
    const hash = await bcrypt.hash(password, SALT_ROUNDS);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  Renostter CRM — Seed de Usuários (Sprint 0)');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Bcrypt rounds: ${SALT_ROUNDS}`);
    console.log(`  Senha: ${'*'.repeat(password.length)}  (${process.env.SEED_PASSWORD ? 'via SEED_PASSWORD' : 'padrão dev'})`);
    console.log(`  Force: ${force ? 'SIM' : 'NÃO'}\n`);

    let created = 0, updated = 0, skipped = 0;

    for (const u of DEFAULT_USERS) {
        try {
            const existing = await dbGet('SELECT id, password FROM usuarios WHERE id = ? OR email = ?', [u.id, u.email]);

            if (existing && !force) {
                // Se já tem senha bcrypt, pula. Se tem plain text, atualiza.
                if (existing.password && /^\$2[aby]\$\d{2}\$/.test(existing.password)) {
                    console.log(`  ⏭  ${u.email.padEnd(35)} já tem senha bcrypt — pulando`);
                    skipped++;
                    continue;
                } else {
                    console.log(`  🔄 ${u.email.padEnd(35)} senha plain text — atualizando para bcrypt`);
                }
            }

            await dbRun(
                `INSERT INTO usuarios
                 (id, nome, username, email, password, role, client_id, ativo, password_changed_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
                 ON CONFLICT(id) DO UPDATE SET
                    nome = excluded.nome,
                    username = excluded.username,
                    email = excluded.email,
                    password = excluded.password,
                    role = excluded.role,
                    client_id = excluded.client_id,
                    password_changed_at = excluded.password_changed_at,
                    updated_at = excluded.updated_at`,
                [u.id, u.nome, u.username, u.email, hash, u.role, u.client_id]
            );

            if (existing) updated++;
            else created++;
            console.log(`  ✓ ${u.email.padEnd(35)} (${u.role})`);
        } catch (e) {
            console.error(`  ✗ ${u.email.padEnd(35)} erro:`, e.message);
        }
    }

    console.log(`\n  Resumo: ${created} criados, ${updated} atualizados, ${skipped} pulados`);
    console.log(`\n  ⚠️  CREDENCIAIS DE ACESSO (guarde com segurança!):`);
    for (const u of DEFAULT_USERS) {
        console.log(`     ${u.email.padEnd(35)} → senha: ${'*'.repeat(password.length)}`);
    }
    if (!process.env.SEED_PASSWORD && !process.argv.find(a => a.startsWith('--password='))) {
        console.log(`\n  ⚠️  Senha padrão de dev: "${password}" — TROCAR EM PRODUÇÃO!`);
    }
    console.log('═══════════════════════════════════════════════════════════\n');

    process.exit(0);
}

run().catch(e => {
    console.error('[Seed] Erro fatal:', e);
    process.exit(1);
});
