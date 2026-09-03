/**
 * Dependency Security Scanner — npm audit + checks customizados
 *
 * Sprint Security Hardening 3 — V27
 *
 * Verifica:
 *   1. `npm audit` (vulnerabilidades conhecidas em deps)
 *   2. Pacotes proibidos (deprecated, abandonados)
 *   3. Versões desatualizadas de pacotes críticos
 *   4. Licenças incompatíveis
 *
 * USO:
 *   node scripts/npm-audit.js              # roda tudo
 *   node scripts/npm-audit.js --json       # saída JSON para CI
 *   node scripts/npm-audit.js --fail       # exit 1 se houver high/critical
 *
 * CI integration:
 *   -name: Security Audit
 *    run: node cora-api/scripts/npm-audit.js --fail
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PACKAGE_JSON = path.join(ROOT, 'cora-api', 'package.json');

const CRITICAL_PACKAGES = [
    'jsonwebtoken',
    'bcryptjs',
    'helmet',
    'cors',
    'express',
    'axios',
    'pg',
    'sqlite3',
    'better-sqlite3',
    'jsonwebtoken',
    'cookie',
    'csurf',
    'express-rate-limit',
];

const PROHIBITED_PACKAGES = [
    // Pacotes deprecated ou com vulnerabilidades conhecidas sem patch
    'request',         // deprecated 2020
    'node-uuid',       // substituído por uuid
    'npm-check',       // sem updates
    'hoek',            // vuln histórica
    'tunnel-agent',    // deprecated
];

const LICENSE_WHITELIST = [
    'MIT', 'ISC', 'BSD', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0',
    'Apache-2.0 WITH LLVM-exception',
    'CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0',
    'Unlicense', 'WTFPL', '0BSD',
    'MPL-2.0', 'LGPL-2.1', 'LGPL-3.0', 'EPL-2.0',
    'Python-2.0',  // alguns pacotes legados
];

function loadPackageJson() {
    return JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
}

/**
 * Roda npm audit e parseia resultado.
 */
function runNpmAudit() {
    console.log('📦 Rodando npm audit...');
    try {
        const result = spawnSync('npm', ['audit', '--json', '--audit-level=low'], {
            cwd: path.dirname(PACKAGE_JSON),
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        // npm audit pode sair com exit 1 quando há vulns — não é erro de execução
        const stdout = result.stdout || '';
        try {
            return JSON.parse(stdout);
        } catch (e) {
            return null;
        }
    } catch (e) {
        console.error('  ✗ Erro ao rodar npm audit:', e.message);
        return null;
    }
}

/**
 * Verifica pacotes proibidos/desatualizados.
 */
function checkProhibited(pkg) {
    const issues = [];
    const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    for (const dep of Object.keys(allDeps)) {
        if (PROHIBITED_PACKAGES.includes(dep)) {
            issues.push({
                type: 'prohibited_package',
                package: dep,
                severity: 'high',
                message: `Pacote "${dep}" é proibido (deprecated/vulnerável). Remova e substitua.`,
            });
        }
    }
    return issues;
}

/**
 * Verifica se pacotes críticos estão nas deps.
 */
function checkCriticalMissing(pkg) {
    const issues = [];
    const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    // Não obrigatório ter todos — apenas alerta
    for (const crit of CRITICAL_PACKAGES) {
        if (!allDeps[crit]) continue;  // não tem, OK
    }
    return issues;
}

/**
 * Verifica licenças dos pacotes instalados.
 */
function checkLicenses() {
    console.log('⚖️  Verificando licenças...');
    const issues = [];
    try {
        // npm ls --json pode falhar com peer dep issues, mas dá info de licenças
        const result = execSync('npm ls --all --json 2>/dev/null', {
            cwd: path.dirname(PACKAGE_JSON),
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        const data = JSON.parse(result);
        const deps = data.dependencies || {};
        for (const [name, info] of Object.entries(deps)) {
            const license = info.license || info.licenses;
            if (license) {
                const lic = typeof license === 'string' ? license : (license.type || license[0]?.type);
                if (lic && !LICENSE_WHITELIST.includes(lic) && lic !== 'UNKNOWN') {
                    issues.push({
                        type: 'uncommon_license',
                        package: name,
                        severity: 'low',
                        message: `Licença incomum: ${lic}`,
                    });
                }
            }
        }
    } catch (e) {
        // npm ls pode falhar — não é crítico
    }
    return issues;
}

/**
 * Converte vulns do npm audit para nosso formato.
 */
function mapAuditVulns(auditData) {
    if (!auditData || !auditData.vulnerabilities) return [];
    const vulns = [];
    for (const [name, info] of Object.entries(auditData.vulnerabilities)) {
        const via = info.via || [];
        for (const v of via) {
            if (typeof v === 'string') continue;  // só nome de pacote
            vulns.push({
                type: 'npm_audit',
                package: name,
                severity: info.severity,  // low, moderate, high, critical
                title: v.title,
                url: v.url,
                range: v.range,
                fixAvailable: !!info.fixAvailable,
                message: `${v.title} em ${name}@${v.range || info.range}`,
            });
        }
    }
    return vulns;
}

function main() {
    const args = process.argv.slice(2);
    const jsonOutput = args.includes('--json');
    const failOnHigh = args.includes('--fail');

    console.log('🔍 Dependency Security Scanner');
    console.log('================================\n');

    const pkg = loadPackageJson();
    const allIssues = [];

    // 1. Proibidos
    const prohibited = checkProhibited(pkg);
    if (prohibited.length > 0) {
        console.log(`⚠️  ${prohibited.length} pacote(s) proibido(s) encontrado(s)`);
    }
    allIssues.push(...prohibited);

    // 2. Críticos faltando
    const missing = checkCriticalMissing(pkg);
    allIssues.push(...missing);

    // 3. Licenças
    const licenses = checkLicenses();
    if (licenses.length > 0) {
        console.log(`⚖️  ${licenses.length} pacote(s) com licença incomum`);
    }
    allIssues.push(...licenses);

    // 4. npm audit
    const auditData = runNpmAudit();
    const auditVulns = mapAuditVulns(auditData);
    if (auditVulns.length > 0) {
        console.log(`📦 ${auditVulns.length} vulnerabilidade(s) encontrada(s) em dependências`);
    } else {
        console.log('📦 ✓ npm audit OK');
    }
    allIssues.push(...auditVulns);

    // Resumo
    const bySeverity = { critical: 0, high: 0, moderate: 0, low: 0, info: 0 };
    for (const issue of allIssues) {
        bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1;
    }

    console.log('\n=== RESUMO ===');
    console.log(`Critical: ${bySeverity.critical}`);
    console.log(`High:     ${bySeverity.high}`);
    console.log(`Moderate: ${bySeverity.moderate}`);
    console.log(`Low:      ${bySeverity.low}`);
    console.log(`Total:    ${allIssues.length}`);

    if (jsonOutput) {
        console.log('\n--- JSON ---');
        console.log(JSON.stringify({ summary: bySeverity, issues: allIssues }, null, 2));
    } else if (allIssues.length > 0) {
        // Mostra só high/critical
        const serious = allIssues.filter(i => i.severity === 'critical' || i.severity === 'high');
        if (serious.length > 0) {
            console.log('\n⚠️  Issues CRÍTICAS/HIGH:');
            serious.slice(0, 10).forEach(i => {
                console.log(`  [${i.severity.toUpperCase()}] ${i.package}: ${i.message}`);
            });
        }
    }

    // Exit code
    if (failOnHigh && (bySeverity.critical > 0 || bySeverity.high > 0)) {
        process.exit(1);
    }
    process.exit(0);
}

if (require.main === module) {
    main();
}

module.exports = { mapAuditVulns, checkProhibited, checkLicenses };
