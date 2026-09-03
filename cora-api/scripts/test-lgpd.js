/**
 * Test Sprint 17 — LGPD / Compliance
 *
 * Valida:
 *   1. LGPDService.createDSAR + listDSARs + updateDSARStatus
 *   2. exportClienteData: retorna todos os dados
 *   3. recordConsent + revokeConsent + getConsents
 *   4. auditAccess + getAuditLogs
 *   5. anonymizeCliente: substitui PII por hashes
 *   6. deleteCliente (soft + hard)
 *   7. política de retenção
 */
const { dbGet, dbAll, dbRun, close } = require('../database');
const LGPDService = require('../services/LGPDService');

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
    return Promise.resolve()
        .then(() => fn())
        .then(() => { passed++; console.log(`  ✓ ${name}`); })
        .catch(err => { failed++; failures.push({ name, err: err.message }); console.log(`  ✗ ${name}: ${err.message}`); });
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEq(a, b, msg) { if (a !== b) throw new Error(`${msg || 'eq'}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`); }

(async () => {
    console.log('\n=== SPRINT 17 — TEST LGPD / COMPLIANCE ===\n');

    let clienteId, clienteId2, dsarId;

    // Setup
    await test('Setup: cria 2 clientes com dados', async () => {
        clienteId = 'cli-lgpd-' + Date.now();
        clienteId2 = 'cli-lgpd2-' + Date.now();
        await dbRun(
            `INSERT INTO clientes (id, nome, email, telefone, cnpj, tenant_id) VALUES (?, 'João Silva', 'joao@test.com', '11999998888', '11111111000111', 'tnt_default')`,
            [clienteId]
        );
        await dbRun(
            `INSERT INTO clientes (id, nome, email, telefone, cnpj, tenant_id) VALUES (?, 'Maria Santos', 'maria@test.com', '11988887777', '22222222000122', 'tnt_default')`,
            [clienteId2]
        );
        // Adiciona dados vinculados
        await dbRun(
            `INSERT INTO contratos (id, cliente_id, valor_mensal, status, tenant_id) VALUES (?, ?, 100, 'Ativo', 'tnt_default')`,
            ['ct-lgpd-1', clienteId]
        );
        await dbRun(
            `INSERT INTO cobrancas (id, contract_id, client_id, valor, data_vencimento, status, tenant_id) VALUES (?, ?, ?, 100, '2026-12-31', 'PAID', 'tnt_default')`,
            ['cob-lgpd-1', 'ct-lgpd-1', clienteId]
        );
    });

    // ─── 1. DSAR ───
    console.log('\n1. DSAR (Data Subject Access Request)');
    await test('createDSAR: cria pedido de acesso', async () => {
        const r = await LGPDService.createDSAR({
            clienteId, tipo: 'acesso', descricao: 'Quero saber quais dados vocês têm sobre mim',
        });
        assert(r.id);
        assertEq(r.tipo, 'acesso');
        assertEq(r.status, 'pendente');
        assert(r.prazo_legal, 'deveria ter prazo_legal');
        dsarId = r.id;
    });

    await test('createDSAR: rejeita tipo inválido', async () => {
        let threw = false;
        try { await LGPDService.createDSAR({ clienteId, tipo: 'invalido' }); } catch (e) { threw = true; }
        assert(threw);
    });

    await test('createDSAR: prazo legal de 15 dias', async () => {
        const r = await LGPDService.createDSAR({ clienteId: clienteId2, tipo: 'portabilidade' });
        const prazoMs = new Date(r.prazo_legal) - new Date();
        const dias = Math.round(prazoMs / (1000 * 60 * 60 * 24));
        assertEq(dias, 15, 'prazo deveria ser 15 dias');
    });

    await test('listDSARs: retorna lista filtrada', async () => {
        const list = await LGPDService.listDSARs({ clienteId });
        assert(list.length >= 1);
    });

    await test('updateDSARStatus: marca como em_analise', async () => {
        await LGPDService.updateDSARStatus(dsarId, { status: 'em_analise' });
        const updated = await LGPDService.getDSAR(dsarId);
        assertEq(updated.status, 'em_analise');
    });

    await test('updateDSARStatus: conclui com resposta', async () => {
        await LGPDService.updateDSARStatus(dsarId, {
            status: 'concluido',
            resposta: 'Seus dados foram exportados',
        });
        const updated = await LGPDService.getDSAR(dsarId);
        assertEq(updated.status, 'concluido');
        assert(updated.concluido_em, 'deveria ter concluido_em');
    });

    // ─── 2. EXPORTAÇÃO ───
    console.log('\n2. Exportação (Portabilidade)');
    await test('exportClienteData: retorna todos os dados', async () => {
        const data = await LGPDService.exportClienteData(clienteId);
        assert(data.exportado_em);
        assert(data.titular);
        assertEq(data.titular.id, clienteId);
        assert(data.dados);
        assert(data.dados.cliente);
        assert(data.dados.contratos);
        assert(data.dados.cobrancas);
        assert(data.dados.consentimentos);
        assert(data.contadores);
        assert(data.contadores.contratos >= 1);
        assert(data.contadores.cobrancas >= 1);
    });

    await test('exportClienteData: rejeita cliente inexistente', async () => {
        let threw = false;
        try { await LGPDService.exportClienteData('cli_inexistente_xyz'); } catch (e) { threw = true; }
        assert(threw);
    });

    // ─── 3. CONSENTIMENTOS ───
    console.log('\n3. Consentimentos');
    await test('recordConsent: registra aceite de marketing_email', async () => {
        const r = await LGPDService.recordConsent({
            clienteId, tipo: 'marketing_email', aceito: true, ip: '127.0.0.1', metodoColeta: 'web_form',
        });
        assert(r.id);
    });

    await test('recordConsent: rejeita tipo inválido', async () => {
        let threw = false;
        try { await LGPDService.recordConsent({ clienteId, tipo: 'invalido', aceito: true }); } catch (e) { threw = true; }
        assert(threw);
    });

    await test('recordConsent: atualiza existente (UPSERT)', async () => {
        const r1 = await LGPDService.recordConsent({ clienteId, tipo: 'cookies', aceito: true });
        const r2 = await LGPDService.recordConsent({ clienteId, tipo: 'cookies', aceito: false });
        assertEq(r2.updated, true, 'deveria atualizar o existente');
    });

    await test('revokeConsent: revoga consentimento', async () => {
        await LGPDService.revokeConsent({ clienteId, tipo: 'marketing_email' });
        const consents = await LGPDService.getConsents(clienteId);
        const mkt = consents.find(c => c.tipo === 'marketing_email');
        assert(mkt, 'consentimento deveria existir');
        assertEq(mkt.aceito, 0);
    });

    await test('getConsents: lista todos', async () => {
        const consents = await LGPDService.getConsents(clienteId);
        assert(consents.length >= 1);
    });

    // ─── 4. AUDIT ───
    console.log('\n4. Audit de Acessos');
    await test('auditAccess: registra acesso', async () => {
        await LGPDService.auditAccess({
            userId: 'user-test',
            userRole: 'admin',
            clienteId,
            acao: 'read',
            entidade: 'cliente',
            entidadeId: clienteId,
            ip: '127.0.0.1',
            motivo: 'Teste',
        });
    });

    await test('auditAccess: rejeita sem acao', async () => {
        let threw = false;
        try { await LGPDService.auditAccess({ entidade: 'cliente' }); } catch (e) { threw = true; }
        assert(threw);
    });

    await test('getAuditLogs: lista logs do cliente', async () => {
        const logs = await LGPDService.getAuditLogs({ clienteId });
        assert(logs.length >= 1);
        assert(logs.some(l => l.acao === 'read'));
    });

    // ─── 5. ANONIMIZAÇÃO ───
    console.log('\n5. Anonimização');
    let clienteAnonId;
    await test('anonymizeCliente: substitui PII por hashes', async () => {
        clienteAnonId = 'cli-anon-' + Date.now();
        await dbRun(
            `INSERT INTO clientes (id, nome, email, telefone, cnpj, tenant_id) VALUES (?, 'Pedro Costa', 'pedro@test.com', '11966665555', '33333333000133', 'tnt_default')`,
            [clienteAnonId]
        );
        const r = await LGPDService.anonymizeCliente(clienteAnonId, { actorUserId: 'admin-test' });
        assert(r.ok);

        const anon = await dbGet('SELECT nome, email, telefone, cnpj FROM clientes WHERE id = ?', [clienteAnonId]);
        assert(anon.nome.startsWith('ANON-'), `nome deveria ser ANON-xxx, é ${anon.nome}`);
        assert(anon.email.startsWith('anon-'), `email deveria ser anonimizado, é ${anon.email}`);
        assertEq(anon.telefone, null, 'telefone deveria ser null');
    });

    await test('anonymizeCliente: registra no audit', async () => {
        const logs = await LGPDService.getAuditLogs({ clienteId: clienteAnonId });
        assert(logs.some(l => l.acao === 'delete' && l.motivo && l.motivo.includes('Anonimização')));
    });

    // ─── 6. EXCLUSÃO ───
    console.log('\n6. Exclusão (Direito ao Esquecimento)');
    let clienteDeleteId;
    await test('deleteCliente (soft): marca como inativo', async () => {
        clienteDeleteId = 'cli-del-' + Date.now();
        await dbRun(
            `INSERT INTO clientes (id, nome, email, tenant_id) VALUES (?, 'Soft Delete', 'sd@test.com', 'tnt_default')`,
            [clienteDeleteId]
        );
        const r = await LGPDService.deleteCliente(clienteDeleteId, { hard: false, actorUserId: 'admin-test' });
        assert(r.ok);
        assertEq(r.method, 'soft');
    });

    await test('deleteCliente (hard): remove permanentemente', async () => {
        const cid = 'cli-hard-' + Date.now();
        await dbRun(
            `INSERT INTO clientes (id, nome, email, tenant_id) VALUES (?, 'Hard Delete', 'hd@test.com', 'tnt_default')`,
            [cid]
        );
        const r = await LGPDService.deleteCliente(cid, { hard: true, actorUserId: 'admin-test' });
        assert(r.ok);
        assertEq(r.method, 'hard');
        const found = await dbGet('SELECT id FROM clientes WHERE id = ?', [cid]);
        assertEq(found, undefined, 'cliente deveria ter sido deletado');
    });

    // ─── 7. POLÍTICA DE RETENÇÃO ───
    console.log('\n7. Política de Retenção');
    await test('getPoliticaRetencao: retorna políticas seedadas', async () => {
        const policies = await LGPDService.getPoliticaRetencao();
        assert(policies.length >= 5, `esperava >= 5 políticas seedadas, tem ${policies.length}`);
        const cobrancas = policies.find(p => p.entidade === 'cobrancas_pagas');
        assert(cobrancas, 'política de cobrancas_pagas deveria existir');
        assertEq(cobrancas.dias_retencao, 1825);
    });

    await test('updatePoliticaRetencao: atualiza dias', async () => {
        await LGPDService.updatePoliticaRetencao('cobrancas_pagas', { diasRetencao: 2555 });
        const policies = await LGPDService.getPoliticaRetencao();
        const cobrancas = policies.find(p => p.entidade === 'cobrancas_pagas');
        assertEq(cobrancas.dias_retencao, 2555);
        // Restaura
        await LGPDService.updatePoliticaRetencao('cobrancas_pagas', { diasRetencao: 1825 });
    });

    await test('runRetentionPolicy: retorna summary', async () => {
        const r = await LGPDService.runRetentionPolicy();
        assert(Array.isArray(r.politicas));
        assert(r.executado_em);
    });

    // ─── Cleanup ───
    await test('Cleanup: deleta dados de teste', async () => {
        await dbRun(`DELETE FROM clientes WHERE id IN (?, ?, ?)`, [clienteId, clienteId2, clienteAnonId]);
        await dbRun(`DELETE FROM contratos WHERE id = 'ct-lgpd-1'`);
        await dbRun(`DELETE FROM cobrancas WHERE id = 'cob-lgpd-1'`);
        await dbRun(`DELETE FROM audit_acessos WHERE cliente_id IN (?, ?, ?)`, [clienteId, clienteId2, clienteAnonId]);
        await dbRun(`DELETE FROM consentimentos WHERE cliente_id IN (?, ?)`, [clienteId, clienteId2]);
        await dbRun(`DELETE FROM dsar_pedidos WHERE cliente_id IN (?, ?)`, [clienteId, clienteId2]);
    });

    console.log('\n=== RESULTADO ===');
    console.log(`Passou: ${passed}`);
    console.log(`Falhou: ${failed}`);
    if (failed > 0) {
        console.log('\nFalhas:');
        failures.forEach(f => console.log(`  - ${f.name}: ${f.err}`));
    }
    try { close(); } catch (_) {}
    setTimeout(() => process.exit(failed > 0 ? 1 : 0), 100);
})().catch(err => {
    console.error('Erro fatal:', err);
    try { close(); } catch (_) {}
    setTimeout(() => process.exit(1), 100);
});
