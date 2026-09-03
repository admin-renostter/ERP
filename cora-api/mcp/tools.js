/**
 * MCP Tools — Tools que o LLM pode chamar
 *
 * Sprint 6 — IA + OpenClaw
 *
 * Cada tool:
 *   - name: identificador único
 *   - description: instrução para o LLM (texto claro, em PT-BR)
 *   - inputSchema: JSON Schema (validação automática)
 *   - handler: função async que executa a lógica
 *
 * O handler recebe o `context` com `serviceToken` para chamar a API interna.
 */

const axios = require('axios');
const path = require('path');

const API_BASE_URL = process.env.RENOSTTER_API_URL || 'http://localhost:3000';
const SERVICE_TOKEN = process.env.MCP_SERVICE_TOKEN || '';

/**
 * Helper: faz request autenticado à API interna.
 */
async function callApi(method, endpoint, data, context) {
    const token = context?.serviceToken || SERVICE_TOKEN;
    if (!token) {
        throw new Error('MCP_SERVICE_TOKEN não configurado');
    }
    const url = `${API_BASE_URL}${endpoint}`;
    try {
        const response = await axios({
            method,
            url,
            data,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        });
        return response.data;
    } catch (e) {
        if (e.response) {
            const err = new Error(e.response.data?.error || e.message);
            err.code = e.response.data?.code || 'API_ERROR';
            err.status = e.response.status;
            throw err;
        }
        throw e;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// TOOL 1: listar_faturas_cliente
// ═══════════════════════════════════════════════════════════════════════════
const listarFaturasCliente = {
    name: 'listar_faturas_cliente',
    description: 'Lista as faturas (cobranças) de um cliente, com filtro opcional por status. Use quando o cliente perguntar sobre débitos, boletos pendentes, ou histórico de pagamentos. Retorna lista com id, valor, vencimento, status e link do PDF/boleto.',
    inputSchema: {
        type: 'object',
        properties: {
            cliente_id: {
                type: 'string',
                description: 'ID do cliente (fornecido pelo usuário ou obtido via consultar_cliente)',
            },
            status: {
                type: 'string',
                enum: ['PENDING', 'OPEN', 'PAID', 'OVERDUE', 'CANCELLED', 'TODAS'],
                description: 'Filtrar por status. Default: TODAS',
                default: 'TODAS',
            },
            limit: {
                type: 'number',
                description: 'Quantidade máxima de resultados (default 10, máximo 50)',
                default: 10,
                minimum: 1,
                maximum: 50,
            },
        },
        required: ['cliente_id'],
    },
    handler: async (args, ctx) => {
        const { cliente_id, status = 'TODAS', limit = 10 } = args;
        const params = { clientId: cliente_id, size: limit };
        if (status !== 'TODAS') params.status = status;
        const result = await callApi('GET', `/api/cobrancas?${new URLSearchParams(params).toString()}`, null, ctx);

        const cobrancas = (result.data || []).map(c => ({
            id: c.id,
            valor: c.valor,
            vencimento: c.data_vencimento,
            status: c.status,
            pdf_url: c.pdf_url,
            barcode: c.barcode,
            linha_digitavel: c.linha_digitavel,
            pix_qrcode: c.pix_qrcode,
        }));

        return {
            total: cobrancas.length,
            cliente_id,
            status_filtrado: status,
            faturas: cobrancas,
        };
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// TOOL 2: consultar_status_chamado
// ═══════════════════════════════════════════════════════════════════════════
const consultarStatusChamado = {
    name: 'consultar_status_chamado',
    description: 'Consulta o status atual de um chamado (OS) específico. Use quando o cliente perguntar "como está meu chamado?", "o técnico já veio?", "quando vai ser resolvido?". Retorna status, técnico responsável, SLA, e últimas atualizações.',
    inputSchema: {
        type: 'object',
        properties: {
            chamado_id: {
                type: 'string',
                description: 'ID do chamado (formato: chm_XXXXXX)',
            },
        },
        required: ['chamado_id'],
    },
    handler: async (args, ctx) => {
        const result = await callApi('GET', `/api/chamados/${args.chamado_id}`, null, ctx);
        const c = result.data;
        return {
            id: c.id,
            status: c.status,
            categoria: c.categoria,
            prioridade: c.prioridade,
            descricao: c.descricao,
            tecnico_responsavel: c.tecnico_nome,
            data_abertura: c.data_abertura,
            data_agendada: c.data_agendada,
            sla_resposta_horas: c.sla_resposta_horas,
            sla_resolucao_horas: c.sla_resolucao_horas,
            em_garantia: c.em_garantia,
            data_garantia_fim: c.data_garantia_fim,
            ultima_atualizacao: c.updated_at,
        };
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// TOOL 3: abrir_chamado
// ═══════════════════════════════════════════════════════════════════════════
const abrirChamado = {
    name: 'abrir_chamado',
    description: 'Abre um novo chamado técnico para um cliente. Use quando o cliente relatar um problema com equipamento de climatização. Após confirmar com o cliente, colete: descrição detalhada, categoria, prioridade. Retorna ID do chamado criado.',
    inputSchema: {
        type: 'object',
        properties: {
            cliente_id: {
                type: 'string',
                description: 'ID do cliente',
            },
            categoria: {
                type: 'string',
                enum: ['Manutenção Corretiva', 'Manutenção Preventiva', 'Instalação', 'Desinstalação', 'Vistoria', 'Orçamento', 'Suporte Técnico'],
                description: 'Categoria do serviço',
            },
            prioridade: {
                type: 'string',
                enum: ['Baixa', 'Média', 'Alta', 'Crítica'],
                description: 'Prioridade (default: Média)',
                default: 'Média',
            },
            descricao: {
                type: 'string',
                description: 'Descrição detalhada do problema relatado pelo cliente',
                minLength: 10,
            },
            equipamento_id: {
                type: 'string',
                description: 'ID do equipamento (se o cliente souber informar)',
            },
        },
        required: ['cliente_id', 'categoria', 'descricao'],
    },
    handler: async (args, ctx) => {
        const result = await callApi('POST', '/api/chamados', args, ctx);
        return {
            success: true,
            chamado_id: result.id,
            status: result.status,
            mensagem: `Chamado aberto com sucesso! ID: ${result.id}. Em breve um técnico entrará em contato.`,
        };
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// TOOL 4: consultar_cliente
// ═══════════════════════════════════════════════════════════════════════════
const consultarCliente = {
    name: 'consultar_cliente',
    description: 'Busca dados cadastrais de um cliente por ID, email ou telefone. Use quando precisar identificar quem é o cliente antes de executar outras ações (listar faturas, abrir chamado, etc). Retorna dados básicos: nome, email, telefone, contratos ativos.',
    inputSchema: {
        type: 'object',
        properties: {
            cliente_id: {
                type: 'string',
                description: 'ID do cliente (cli-XXXXXX)',
            },
            email: {
                type: 'string',
                description: 'Email do cliente (alternativa ao ID)',
            },
            telefone: {
                type: 'string',
                description: 'Telefone do cliente (alternativa, com DDD)',
            },
        },
        anyOf: [
            { required: ['cliente_id'] },
            { required: ['email'] },
            { required: ['telefone'] },
        ],
    },
    handler: async (args, ctx) => {
        const params = new URLSearchParams();
        if (args.cliente_id) params.set('id', args.cliente_id);
        if (args.email) params.set('email', args.email);
        if (args.telefone) params.set('telefone', args.telefone);
        const result = await callApi('GET', `/api/clientes?${params.toString()}`, null, ctx);
        const list = Array.isArray(result.data) ? result.data : (result.data ? [result.data] : []);
        if (list.length === 0) {
            return { encontrado: false, mensagem: 'Nenhum cliente encontrado com esses dados.' };
        }
        const c = list[0];
        return {
            encontrado: true,
            cliente: {
                id: c.id,
                nome: c.nome,
                email: c.email,
                telefone: c.telefone,
                cnpj_cpf: c.cnpj || c.cpf,
                endereco: c.endereco,
                cidade: c.cidade,
                estado: c.estado,
                contratos_ativos: c.contratos_ativos || 0,
            },
        };
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// TOOL 5: listar_equipamentos_cliente
// ═══════════════════════════════════════════════════════════════════════════
const listarEquipamentosCliente = {
    name: 'listar_equipamentos_cliente',
    description: 'Lista os equipamentos (ar-condicionado, HVAC) cadastrados de um cliente. Use quando o cliente perguntar quais equipamentos estão em contrato, ou para identificar qual equipamento tem problema ao abrir um chamado. Retorna lista com marca, modelo, BTU, local de instalação.',
    inputSchema: {
        type: 'object',
        properties: {
            cliente_id: {
                type: 'string',
                description: 'ID do cliente',
            },
        },
        required: ['cliente_id'],
    },
    handler: async (args, ctx) => {
        const result = await callApi('GET', `/api/pmoc/cliente/${args.cliente_id}/equipamentos`, null, ctx);
        const eqs = (result.data || []).map(e => ({
            id: e.id,
            marca: e.marca,
            modelo: e.modelo,
            tipo: e.tipo_equipamento,
            potencia_btu: e.potencia_btu,
            potencia_kw: e.potencia_kw,
            local_instalacao: e.local_instalacao,
            refrigerante: e.refrigerante,
            precisa_pmoc: e.precisa_pmoc,
            status: e.status_equipamento,
        }));
        return { cliente_id: args.cliente_id, total: eqs.length, equipamentos: eqs };
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// TOOL 6: agendar_visita_tecnica
// ═══════════════════════════════════════════════════════════════════════════
const agendarVisitaTecnica = {
    name: 'agendar_visita_tecnica',
    description: 'Agenda uma visita técnica para um chamado existente. Use quando o cliente quiser marcar dia/horário para o técnico ir até o local. Retorna confirmação do agendamento.',
    inputSchema: {
        type: 'object',
        properties: {
            chamado_id: {
                type: 'string',
                description: 'ID do chamado a ser agendado',
            },
            data: {
                type: 'string',
                description: 'Data desejada (formato YYYY-MM-DD)',
                pattern: '^\\d{4}-\\d{2}-\\d{2}$',
            },
            periodo: {
                type: 'string',
                enum: ['manha', 'tarde', 'comercial', 'flexivel'],
                description: 'Período preferido (default: flexivel)',
                default: 'flexivel',
            },
            observacoes: {
                type: 'string',
                description: 'Observações adicionais (ex: "técnico deve ligar ao chegar")',
            },
        },
        required: ['chamado_id', 'data'],
    },
    handler: async (args, ctx) => {
        const result = await callApi('PATCH', `/api/chamados/${args.chamado_id}`, {
            data_agendada: args.data,
            periodo_agendamento: args.periodo,
            observacoes_agendamento: args.observacoes,
        }, ctx);
        return {
            success: true,
            chamado_id: args.chamado_id,
            data_agendada: args.data,
            periodo: args.periodo,
            mensagem: `Visita agendada para ${args.data} (${args.periodo}). O técnico ligará para confirmar.`,
        };
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// TOOL 7: solicitar_segunda_via_boleto
// ═══════════════════════════════════════════════════════════════════════════
const solicitarSegundaViaBoleto = {
    name: 'solicitar_segunda_via_boleto',
    description: 'Reenvia o boleto/PDF de uma fatura existente para o email do cliente. Use quando o cliente disser que perdeu o boleto, não recebeu, ou quer uma segunda via. Retorna confirmação e URL do PDF.',
    inputSchema: {
        type: 'object',
        properties: {
            cobranca_id: {
                type: 'string',
                description: 'ID da cobrança (cob_XXXXXX)',
            },
        },
        required: ['cobranca_id'],
    },
    handler: async (args, ctx) => {
        // Envia notificação por email (re-uso do endpoint existente)
        await callApi('POST', '/api/cobrancas/notificacoes', {
            cobranca_id: args.cobranca_id,
            canal: 'email',
        }, ctx);
        // Retorna também o PDF direto
        const cobranca = await callApi('GET', `/api/cobrancas/${args.cobranca_id}`, null, ctx);
        return {
            success: true,
            cobranca_id: args.cobranca_id,
            pdf_url: cobranca.data?.pdf_url,
            barcode: cobranca.data?.barcode,
            linha_digitavel: cobranca.data?.linha_digitavel,
            pix_qrcode: cobranca.data?.pix_qrcode,
            mensagem: 'Segunda via enviada por email. O PDF também está disponível no link acima.',
        };
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// TOOL 8: consultar_contrato
// ═══════════════════════════════════════════════════════════════════════════
const consultarContrato = {
    name: 'consultar_contrato',
    description: 'Consulta os contratos ativos de um cliente, com tipo de plano, valor mensal, SLA e data de vencimento. Use quando o cliente perguntar sobre seu plano, cobertura, ou data de renovação.',
    inputSchema: {
        type: 'object',
        properties: {
            cliente_id: {
                type: 'string',
                description: 'ID do cliente',
            },
        },
        required: ['cliente_id'],
    },
    handler: async (args, ctx) => {
        const result = await callApi('GET', `/api/contratos?clienteId=${args.cliente_id}`, null, ctx);
        const contratos = (result.data || []).map(ct => ({
            id: ct.id,
            titulo: ct.titulo,
            tipo: ct.tipo_label || ct.tipo_contrato,
            valor_mensal: ct.valor_mensal,
            valor_anual: ct.valor_anual,
            data_inicio: ct.data_inicio,
            data_fim: ct.data_fim,
            dias_restantes: ct.dias_restantes,
            status: ct.status,
            sla_resposta_horas: ct.sla_resposta_horas,
            sla_resolucao_horas: ct.sla_resolucao_horas,
            equipamentos_inclusos: ct.qtd_equipamentos_inclusos,
            renovacao_automatica: ct.renovacao_automatica,
        }));
        return { cliente_id: args.cliente_id, total: contratos.length, contratos };
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRO DE TOOLS
// ═══════════════════════════════════════════════════════════════════════════
const TOOLS = [
    listarFaturasCliente,
    consultarStatusChamado,
    abrirChamado,
    consultarCliente,
    listarEquipamentosCliente,
    agendarVisitaTecnica,
    solicitarSegundaViaBoleto,
    consultarContrato,
];

const TOOLS_BY_NAME = Object.fromEntries(TOOLS.map(t => [t.name, t]));

async function handleToolCall(name, args, context) {
    const tool = TOOLS_BY_NAME[name];
    if (!tool) {
        const err = new Error(`Tool não encontrada: ${name}`);
        err.code = 'TOOL_NOT_FOUND';
        throw err;
    }
    // Validação simples (em produção, usar Ajv)
    if (tool.inputSchema?.required) {
        for (const req of tool.inputSchema.required) {
            if (args[req] === undefined || args[req] === null) {
                const err = new Error(`Campo obrigatório ausente: ${req}`);
                err.code = 'MISSING_REQUIRED';
                throw err;
            }
        }
    }
    return await tool.handler(args, context);
}

module.exports = { TOOLS, handleToolCall, TOOLS_BY_NAME };
