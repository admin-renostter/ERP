/**
 * Test Sprint 16 — Mobile API
 *
 * Valida:
 *   1. MobileService.syncFull / syncIncremental
 *   2. uploadPhoto / listPhotos / deletePhoto
 *   3. recordLocation / getCurrentLocation / getRecentLocations
 *   4. updateTicketMobile com versionamento
 *   5. registerPushToken / unregisterPushToken
 *   6. logSync / getSyncStats
 */
const { dbGet, dbAll, dbRun, close } = require('../database');
const MobileService = require('../services/MobileService');

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
    console.log('\n=== SPRINT 16 — TEST MOBILE API ===\n');

    let clienteId, ticket1Id, ticket2Id, photoId, tecnicoId;

    // Setup
    await test('Setup: cria cliente + 2 técnicos + 2 chamados', async () => {
        clienteId = 'cli-mobile-' + Date.now();
        const tecnicoA = 'tec-mobile-a-' + Date.now();
        const tecnicoB = 'tec-mobile-b-' + Date.now();
        tecnicoId = tecnicoA;

        await dbRun(
            `INSERT INTO clientes (id, nome, email, tenant_id) VALUES (?, ?, ?, 'tnt_default')`,
            [clienteId, 'Cliente Mobile Test', 'cliente@test.com']
        );
        await dbRun(
            `INSERT INTO usuarios (id, username, email, nome, password, role, ativo) VALUES (?, ?, ?, ?, ?, 'tecnico', 1)`,
            [tecnicoA, tecnicoA, `${tecnicoA}@test.com`, 'Tecnico A', 'test']
        );
        await dbRun(
            `INSERT INTO usuarios (id, username, email, nome, password, role, ativo) VALUES (?, ?, ?, ?, ?, 'tecnico', 1)`,
            [tecnicoB, tecnicoB, `${tecnicoB}@test.com`, 'Tecnico B', 'test']
        );

        // Cria 2 chamados: 1 para A, 1 para B
        ticket1Id = 'ch-mob-a-' + Date.now();
        await dbRun(
            `INSERT INTO chamados (id, cliente_id, tecnico_id, titulo, status, tenant_id)
             VALUES (?, ?, ?, 'Chamado A', 'Aberto', 'tnt_default')`,
            [ticket1Id, clienteId, tecnicoA]
        );
        ticket2Id = 'ch-mob-b-' + Date.now();
        await dbRun(
            `INSERT INTO chamados (id, cliente_id, tecnico_id, titulo, status, tenant_id)
             VALUES (?, ?, ?, 'Chamado B', 'Aberto', 'tnt_default')`,
            [ticket2Id, clienteId, tecnicoB]
        );
    });

    // ─── 1. SYNC ───
    console.log('\n1. Sync');
    await test('syncFull: retorna tickets do técnico', async () => {
        const r = await MobileService.syncFull(tecnicoId);
        assert(r.type === 'full');
        const ticketsA = r.data.tickets.filter(t => t.id === ticket1Id);
        const ticketsB = r.data.tickets.filter(t => t.id === ticket2Id);
        assertEq(ticketsA.length, 1, 'técnico A deveria ver seu chamado');
        assertEq(ticketsB.length, 0, 'técnico A NÃO deveria ver chamado de B');
    });

    await test('syncFull: inclui clientes e contratos', async () => {
        const r = await MobileService.syncFull(tecnicoId);
        assert(r.data.clientes.length >= 1);
        assert(Array.isArray(r.data.contratos));
    });

    await test('syncIncremental: retorna tickets novos', async () => {
        const since = new Date(Date.now() - 60000).toISOString();
        const r = await MobileService.syncIncremental(tecnicoId, since);
        assert(r.type === 'incremental');
        assert(Array.isArray(r.data.tickets_updated));
    });

    // ─── 2. FOTOS ───
    console.log('\n2. Fotos');
    await test('uploadPhoto: aceita base64', async () => {
        // Foto 1x1 pixel transparente em base64
        const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        const r = await MobileService.uploadPhoto(tecnicoId, ticket1Id, {
            base64: tinyPng,
            filename: 'test.png',
            mime_type: 'image/png',
            latitude: -23.55,
            longitude: -46.63,
        });
        assert(r.id, 'foto sem id');
        assertEq(r.tamanho_bytes, Math.ceil(tinyPng.length * 0.75));
        photoId = r.id;
    });

    await test('uploadPhoto: rejeita mime_type inválido', async () => {
        let threw = false;
        try {
            await MobileService.uploadPhoto(tecnicoId, ticket1Id, {
                base64: 'abc', filename: 'test.exe', mime_type: 'application/exe',
            });
        } catch (e) { threw = true; }
        assert(threw, 'deveria rejeitar mime_type inválido');
    });

    await test('uploadPhoto: rejeita foto muito grande', async () => {
        let threw = false;
        try {
            const big = 'A'.repeat(20 * 1024 * 1024);  // 20MB
            await MobileService.uploadPhoto(tecnicoId, ticket1Id, {
                base64: big, filename: 'big.png', mime_type: 'image/png',
            });
        } catch (e) { threw = true; }
        assert(threw, 'deveria rejeitar foto > 10MB');
    });

    await test('listPhotos: retorna fotos do chamado', async () => {
        const list = await MobileService.listPhotos(tecnicoId, ticket1Id);
        assert(list.length >= 1, 'esperava >= 1 foto');
        assert(list.some(p => p.id === photoId), 'deveria ter a foto enviada');
    });

    await test('uploadPhoto: não permite upload em chamado de outro técnico', async () => {
        let threw = false;
        try {
            await MobileService.uploadPhoto(tecnicoId, ticket2Id, {
                base64: 'abc', filename: 'x.png', mime_type: 'image/png',
            });
        } catch (e) { threw = true; }
        assert(threw, 'técnico A não deveria poder anexar foto em chamado de B');
    });

    // ─── 3. GEOLOCALIZAÇÃO ───
    console.log('\n3. Geolocalização');
    await test('recordLocation: aceita coordenadas válidas', async () => {
        const r = await MobileService.recordLocation(tecnicoId, {
            latitude: -23.55, longitude: -46.63,
            precisao: 10, speed: 5, battery_level: 0.85,
        });
        assert(r.ok);
    });

    await test('recordLocation: rejeita latitude inválida', async () => {
        let threw = false;
        try {
            await MobileService.recordLocation(tecnicoId, { latitude: 999, longitude: 0 });
        } catch (e) { threw = true; }
        assert(threw);
    });

    await test('getCurrentLocation: retorna última posição', async () => {
        const current = await MobileService.getCurrentLocation(tecnicoId);
        assert(current, 'deveria ter posição atual');
        assertEq(current.latitude, -23.55);
    });

    await test('getRecentLocations: retorna histórico', async () => {
        const list = await MobileService.getRecentLocations(tecnicoId, 10);
        assert(list.length >= 1);
    });

    // ─── 4. UPDATES COM VERSIONAMENTO ───
    console.log('\n4. Updates com Versionamento');
    await test('updateTicketMobile: sucesso com versão correta', async () => {
        const chamado = await dbGet('SELECT version FROM chamados WHERE id = ?', [ticket1Id]);
        const r = await MobileService.updateTicketMobile(tecnicoId, ticket1Id, {
            status: 'Em Andamento',
            expected_version: chamado.version,
        });
        assert(r.ok);
        assertEq(r.version, chamado.version + 1);
    });

    await test('updateTicketMobile: falha com versão errada (409)', async () => {
        let threw = false;
        try {
            await MobileService.updateTicketMobile(tecnicoId, ticket1Id, {
                status: 'Resolvido',
                expected_version: 999,  // versão errada
            });
        } catch (e) {
            threw = true;
            assertEq(e.code, 'VERSION_CONFLICT');
        }
        assert(threw);
    });

    await test('updateTicketMobile: force=true sobrescreve versão', async () => {
        const r = await MobileService.updateTicketMobile(tecnicoId, ticket1Id, {
            status: 'Resolvido',
            force: true,
        });
        assert(r.ok);
    });

    await test('updateTicketMobile: não permite update em chamado de outro técnico', async () => {
        let threw = false;
        try {
            await MobileService.updateTicketMobile(tecnicoId, ticket2Id, {
                status: 'Resolvido',
            });
        } catch (e) { threw = true; }
        assert(threw);
    });

    // ─── 5. PUSH TOKENS ───
    console.log('\n5. Push Tokens');
    await test('registerPushToken: cria token', async () => {
        const r = await MobileService.registerPushToken(tecnicoId, {
            token: 'fake-fcm-token-abc123',
            platform: 'android',
            device_id: 'device-001',
            device_name: 'Moto G54',
            app_version: '1.0.0',
        });
        assert(r.id);
    });

    await test('registerPushToken: rejeita platform inválido', async () => {
        let threw = false;
        try {
            await MobileService.registerPushToken(tecnicoId, {
                token: 'abc', platform: 'flipper',
            });
        } catch (e) { threw = true; }
        assert(threw);
    });

    await test('registerPushToken: atualiza token existente', async () => {
        const r = await MobileService.registerPushToken(tecnicoId, {
            token: 'fake-fcm-token-abc123',  // mesmo token
            platform: 'android',
            device_id: 'device-001-updated',
        });
        assertEq(r.updated, true);
    });

    await test('unregisterPushToken: desativa token', async () => {
        const r = await MobileService.unregisterPushToken(tecnicoId, 'fake-fcm-token-abc123');
        assert(r.ok);
    });

    // ─── 6. SYNC LOG / STATS ───
    console.log('\n6. Stats');
    await test('logSync: registra sync', async () => {
        await MobileService.logSync(tecnicoId, {
            device_id: 'device-001',
            sync_type: 'full',
            tickets_received: 5,
            photos_sent: 2,
            duration_ms: 250,
        });
        const stats = await MobileService.getSyncStats(tecnicoId, 7);
        assert(stats.length >= 1);
        const fullSync = stats.find(s => s.sync_type === 'full');
        assert(fullSync, 'deveria ter stats de full sync');
    });

    // ─── Cleanup ───
    await test('Cleanup: deleta dados de teste', async () => {
        await dbRun(`DELETE FROM chamado_fotos WHERE chamado_id IN (?, ?)`, [ticket1Id, ticket2Id]);
        await dbRun(`DELETE FROM mobile_sync_log WHERE user_id = ?`, [tecnicoId]);
        await dbRun(`DELETE FROM push_tokens WHERE user_id = ?`, [tecnicoId]);
        await dbRun(`DELETE FROM tecnico_localizacao WHERE tecnico_id = ?`, [tecnicoId]);
        await dbRun(`DELETE FROM chamados WHERE id IN (?, ?)`, [ticket1Id, ticket2Id]);
        await dbRun(`DELETE FROM clientes WHERE id = ?`, [clienteId]);
        await dbRun(`DELETE FROM usuarios WHERE id = ?`, [tecnicoId]);
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
