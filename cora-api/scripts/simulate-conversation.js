/**
 * Simulate Conversation — Mostra o que o Claude enviaria/receberia do MCP
 *
 * Sprint 6 — Validação do fluxo de IA
 *
 * Não chama a API real (não precisa de DB rodando). Apenas SIMULA o que
 * aconteceria em produção, mostrando os payloads JSON exatos que o
 * Anthropic Claude enviaria para o MCP server.
 *
 * Uso:
 *   node scripts/simulate-conversation.js
 *
 * Para o usuário ver, sem precisar de LLM/DB/etc.
 */

const { TOOLS, TOOLS_BY_NAME } = require('../mcp/tools');

let stepNum = 0;
function step(title) {
    stepNum++;
    console.log(`\n${'─'.repeat(75)}`);
    console.log(`  [${stepNum}] ${title}`);
    console.log('─'.repeat(75));
}

function showClaudeThinking(reasoning) {
    console.log(`\n  🧠 Claude pensa:`);
    console.log(`     ${reasoning}`);
}

function showToolCall(toolName, args) {
    console.log(`\n  📤 Claude chama tool:`);
    console.log(`     Tool: ${toolName}`);
    console.log(`     Args: ${JSON.stringify(args, null, 2).replace(/\n/g, '\n     ')}`);
}

function showToolResult(result) {
    console.log(`\n  📥 Tool responde:`);
    console.log(`     ${JSON.stringify(result, null, 2).replace(/\n/g, '\n     ')}`);
}

function showClaudeSays(message) {
    console.log(`\n  💬 Claude diz pro cliente:`);
    console.log(`     "${message}"`);
}

async function simulateScenario1() {
    console.log('\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║  CENÁRIO 1: Cliente perdeu o boleto, pede segunda via no WhatsApp  ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝');

    step('Cliente envia mensagem');
    console.log('  WhatsApp: 📱 "+55 11 95891-8398" → "oi, perdi meu boleto, pode me mandar de novo?"');
    console.log('  OpenClaw recebe, transcreve (se áudio), passa pro Claude.');

    step('Claude processa a mensagem');
    showClaudeThinking('O cliente quer uma segunda via do boleto. Antes preciso identificar ' +
        'quem ele é pelo telefone. Vou usar a tool consultar_cliente.');
    showToolCall('consultar_cliente', { telefone: '+5511958918398' });

    step('Tool retorna o cliente');
    showToolResult({
        encontrado: true,
        cliente: {
            id: 'cli-123abc',
            nome: 'João Silva',
            email: 'joao@exemplo.com',
            telefone: '+5511958918398',
            contratos_ativos: 1,
        },
    });

    showClaudeThinking('Cliente identificado. Agora vou buscar as faturas em aberto.');
    showToolCall('listar_faturas_cliente', {
        cliente_id: 'cli-123abc',
        status: 'PENDING',
        limit: 5,
    });

    step('Tool retorna faturas');
    showToolResult({
        total: 2,
        faturas: [
            {
                id: 'cob_xyz789',
                valor: 350.00,
                vencimento: '2026-08-30',
                status: 'PENDING',
                pdf_url: 'https://s3.renostter.com/documents/2026/08/abc123.pdf',
                linha_digitavel: '23793.38128 60082.803526 95000.063005 8 84720000035000',
            },
            {
                id: 'cob_abc456',
                valor: 120.00,
                vencimento: '2026-09-15',
                status: 'PENDING',
                pdf_url: 'https://s3.renostter.com/documents/2026/08/def456.pdf',
                linha_digitavel: '23793.38128 60082.803526 95000.063005 9 84720000012000',
            },
        ],
    });

    showClaudeThinking('Encontrei 2 faturas. A primeira vence em 5 dias. Vou pedir confirmação ' +
        'porque solicitar_segunda_via_boleto é uma ação que modifica estado.');

    step('Claude confirma com o cliente antes de enviar');
    showClaudeSays('Olá João! Encontrei 2 boletos em aberto:\n\n' +
        '1) R$ 350,00 - vencimento 30/08/2026\n' +
        '2) R$ 120,00 - vencimento 15/09/2026\n\n' +
        'Qual você quer que eu reenvie?');

    console.log('\n  [Cliente responde: "o de 350"]');

    showClaudeThinking('OK, ele escolheu o primeiro. Agora executo a tool de envio.');
    showToolCall('solicitar_segunda_via_boleto', { cobranca_id: 'cob_xyz789' });

    step('Tool envia email + retorna PDF');
    showToolResult({
        success: true,
        cobranca_id: 'cob_xyz789',
        pdf_url: 'https://s3.renostter.com/documents/2026/08/abc123.pdf',
        linha_digitavel: '23793.38128 60082.803526 95000.063005 8 84720000035000',
        pix_qrcode: '00020126580014BR.GOV.BCB.PIX...',
    });

    showClaudeSays('Pronto João! Te enviei o boleto de R$ 350,00 no seu email ' +
        '(joao@exemplo.com). Aqui também está o link para abrir direto: ' +
        'https://s3.renostter.com/documents/2026/08/abc123.pdf\n\n' +
        'Qualquer dúvida é só chamar! 😊');
}

async function simulateScenario2() {
    console.log('\n\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║  CENÁRIO 2: Cliente relata problema com ar-condicionado via áudio  ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝');

    step('Cliente envia áudio no WhatsApp');
    console.log('  WhatsApp: 🎤 "meu ar condicionado do escritório tá pingando água, "');
    console.log('                  "já tem 3 dias assim, tô preocupado"');

    step('OpenClaw transcreve o áudio com Whisper');
    console.log('  Whisper: "meu ar condicionado do escritório tá pingando água,');
    console.log('            já tem 3 dias assim, tô preocupado"');

    step('Claude processa');
    showClaudeThinking('Problema relatado: ar pingando. É manutenção corretiva. ' +
        'Antes de abrir o chamado, preciso identificar o cliente e os equipamentos dele.');
    showToolCall('consultar_cliente', { telefone: '+5511958918398' });
    showToolResult({ encontrado: true, cliente: { id: 'cli-123abc', nome: 'João Silva' } });
    showToolCall('listar_equipamentos_cliente', { cliente_id: 'cli-123abc' });
    showToolResult({
        total: 3,
        equipamentos: [
            { id: 'eq-001', marca: 'Carrier', modelo: 'XPower Inverter', local_instalacao: 'Escritório', potencia_btu: 18000 },
            { id: 'eq-002', marca: 'LG', modelo: 'Dual Inverter', local_instalacao: 'Sala de reunião', potencia_btu: 24000 },
            { id: 'eq-003', marca: 'Samsung', modelo: 'WindFree', local_instalacao: 'Recepção', potencia_btu: 12000 },
        ],
    });

    showClaudeThinking('3 equipamentos. O cliente falou "do escritório" que é o eq-001. ' +
        'Antes de abrir o chamado, peço confirmação dos detalhes.');

    step('Claude pede confirmação');
    showClaudeSays('Entendi João! Pelo que você descreveu, é manutenção corretiva ' +
        'no seu Carrier do escritório (18.000 BTU). ' +
        'Vou abrir um chamado com prioridade Alta, pode ser?\n\n' +
        'Se preferir, posso anotar prioridade Média ou outro equipamento.');

    console.log('\n  [Cliente responde: "pode ser alta mesmo"]');

    showToolCall('abrir_chamado', {
        cliente_id: 'cli-123abc',
        categoria: 'Manutenção Corretiva',
        prioridade: 'Alta',
        descricao: 'Ar-condicionado do escritório (Carrier XPower Inverter, 18.000 BTU) está pingando água há 3 dias. Cliente relata preocupação.',
        equipamento_id: 'eq-001',
    });
    showToolResult({
        success: true,
        chamado_id: 'chm_2026_0089',
        status: 'Aberto',
    });

    showClaudeSays('Chamado #chm_2026_0089 aberto com sucesso! Um técnico vai te ' +
        'ligar nas próximas 2 horas para agendar a visita. 👍');
}

async function simulateScenario3() {
    console.log('\n\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║  CENÁRIO 3: Cliente pergunta status de chamado em aberto           ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝');

    step('Cliente pergunta');
    console.log('  WhatsApp: "oi, queria saber como tá o chamado que eu abri ontem"');

    showClaudeThinking('Cliente quer status de chamado. Mas qual? Vou listar os ' +
        'chamados abertos dele primeiro, ou ele pode me dar o ID.');
    showToolCall('consultar_cliente', { telefone: '+5511958918398' });
    showToolResult({ encontrado: true, cliente: { id: 'cli-123abc' } });

    showClaudeThinking('Vou pegar todos os chamados dele. Mas o endpoint consultar_status_chamado ' +
        'precisa de um chamado_id. Preciso primeiro listar os chamados dele. Hmm, na verdade ' +
        'esse tool pede o ID direto. Vou perguntar o ID pro cliente.');

    showClaudeSays('Oi João! Você lembra o número do chamado? Se não, me dá seu email ' +
        'que eu localizo pra você.');

    console.log('\n  [Cliente responde: "joao@exemplo.com, acho que é o 89"]');
    showToolCall('consultar_status_chamado', { chamado_id: 'chm_2026_0089' });
    showToolResult({
        id: 'chm_2026_0089',
        status: 'Em Andamento',
        categoria: 'Manutenção Corretiva',
        prioridade: 'Alta',
        descricao: 'Ar-condicionado do escritório pingando há 3 dias',
        tecnico_responsavel: 'Carlos Mendes',
        data_abertura: '2026-08-23T10:30:00Z',
        data_agendada: '2026-08-24T14:00:00Z',
        sla_resposta_horas: 2,
        sla_resolucao_horas: 24,
        em_garantia: false,
        ultima_atualizacao: '2026-08-23T16:45:00Z',
    });

    showClaudeSays('Achei! Seu chamado #89 está "Em Andamento". ' +
        'O técnico Carlos Mendes já foi designado e a visita está agendada ' +
        'para HOJE às 14:00. 🎯\n\n' +
        'Alguma outra coisa?');
}

async function main() {
    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('  Renostter CRM — Simulação de Conversa Claude ↔ MCP');
    console.log('  Mostra payloads JSON reais que o LLM enviaria/receberia');
    console.log('═══════════════════════════════════════════════════════════════════════');

    console.log('\n  Tools MCP disponíveis:');
    TOOLS.forEach(t => {
        console.log(`    • ${t.name} — ${t.description.substring(0, 60)}...`);
    });

    await simulateScenario1();
    await simulateScenario2();
    await simulateScenario3();

    console.log('\n\n═══════════════════════════════════════════════════════════════════════');
    console.log('  ✅ Simulação concluída');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('\n  Como testar de verdade:');
    console.log('    1. Suba o stack:    docker compose up -d');
    console.log('    2. Health check:    curl http://localhost:3000/health/ready');
    console.log('    3. Crie usuários:   docker compose exec cora-api node scripts/seed-users.js');
    console.log('    4. Service token:   node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    console.log('    5. Adicione ao .env: MCP_SERVICE_TOKEN=<token>');
    console.log('    6. Teste o MCP:     docker compose exec cora-api node scripts/test-mcp.js');
    console.log('    7. Claude Desktop:  adicione o MCP server em claude_desktop_config.json');
    console.log('    8. OpenClaw:        curl -H "Authorization: Bearer $MCP_SERVICE_TOKEN" \\');
    console.log('                         http://localhost:3000/mcp/openclaw.yaml');
    console.log('');
    process.exit(0);
}

main().catch(e => {
    console.error('Erro:', e);
    process.exit(1);
});
