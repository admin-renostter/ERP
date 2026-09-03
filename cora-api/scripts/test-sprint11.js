/**
 * Test Sprint 11 — Templates de Contrato
 */
const { dbRun } = require('../database');
const TemplateService = require('../services/TemplateService');
const pdf = require('../services/PdfGenerator');

(async () => {
    console.log('\n=== SPRINT 11 — TEST TEMPLATES ===\n');

    // 1. Inicializa schema (se ainda não)
    console.log('1. Criando tabela contract_templates...');
    try {
        await dbRun(`CREATE TABLE IF NOT EXISTS contract_templates (
            id TEXT PRIMARY KEY,
            slug TEXT UNIQUE NOT NULL,
            nome TEXT NOT NULL,
            descricao TEXT,
            categoria TEXT DEFAULT 'geral',
            tipo_contrato TEXT,
            html_content TEXT NOT NULL,
            css_content TEXT,
            variables_json TEXT,
            ativo INTEGER DEFAULT 1,
            versao INTEGER DEFAULT 1,
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        console.log('   OK');
    } catch (e) {
        console.log('   Aviso:', e.message);
    }

    // 2. Seed templates padrão
    console.log('\n2. Criando templates padrão...');
    const seedResult = await TemplateService.seedPadroes();
    console.log('   Resultados:', JSON.stringify(seedResult, null, 2));

    // 3. Listar
    console.log('\n3. Listando templates...');
    const lista = await TemplateService.listar();
    console.log('   Total:', lista.data.length);
    lista.data.forEach(t => console.log(`   - ${t.slug}: ${t.nome} (v${t.versao})`));

    // 4. Renderizar com data
    console.log('\n4. Renderizando template "manutencao"...');
    const tpl = await TemplateService.buscarPorSlug('manutencao');
    if (tpl) {
        const result = await TemplateService.renderizarTemplate(tpl.id, {
            contrato: {
                id: 'ct_001',
                titulo: 'Contrato Manutenção',
                valor_mensal: 350.00,
                data_inicio: '2026-09-01',
                data_fim: '2027-08-31',
                sla_resposta_horas: 24,
                sla_resolucao_horas: 72,
            },
            cliente: {
                nome: 'Empresa Teste LTDA',
                email: 'cliente@teste.com',
                telefone: '(11) 99999-9999',
                cnpj_cpf: '12.345.678/0001-90',
                endereco: 'Rua Teste, 123',
                cidade: 'São Paulo',
                estado: 'SP',
            },
            empresa: {
                nome: 'Renostter Climatização LTDA',
                cnpj: '11.222.333/0001-44',
                endereco: 'Av. Brasil, 1000',
                cidade: 'São Paulo',
                estado: 'SP',
            },
        });
        console.log(`   Placeholders usados: ${result.placeholders.length}`);
        console.log(`   HTML size: ${result.html.length} chars`);
        console.log(`   Versão: ${result.versao}`);

        // 5. Gerar PDF a partir do HTML renderizado
        console.log('\n5. Gerando PDF a partir do template...');
        const pdfBuf = await pdf.renderContract('manutencao', {
            contrato: {
                id: 'ct_001',
                titulo: 'Contrato Manutenção',
                valor_mensal: 350.00,
                data_inicio: '2026-09-01',
                data_fim: '2027-08-31',
            },
            cliente: { nome: 'Empresa Teste', email: 'cliente@teste.com' },
        });
        console.log(`   PDF gerado: ${pdfBuf.length} bytes`);
        console.log(`   Header: ${pdfBuf.toString('utf-8', 0, 8)}`);
    } else {
        console.log('   Template "manutencao" não encontrado');
    }

    // 6. Testar extração de placeholders
    console.log('\n6. Extraindo placeholders de HTML...');
    const testHtml = '<h1>{{cliente.nome}}</h1><p>Contrato {{contrato.id}} - R$ {{contrato.valor_mensal}}</p>';
    const vars = TemplateService.extractPlaceholders(testHtml);
    console.log('   Variáveis encontradas:', vars);

    // 7. Duplicar template
    console.log('\n7. Duplicando template "manutencao"...');
    if (tpl) {
        const dup = await TemplateService.duplicar(tpl.id, 'manutencao-teste');
        console.log('   Duplicado:', dup.slug, 'v' + dup.versao);
        // Limpar
        await TemplateService.remover(dup.id);
        console.log('   Removido');
    }

    console.log('\n=== TUDO OK ===');
    process.exit(0);
})().catch(e => {
    console.error('ERRO:', e.message);
    console.error(e.stack);
    process.exit(1);
});
