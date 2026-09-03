/**
 * TemplateService — CRUD de Templates de Contrato + Render com placeholders
 *
 * Sprint 11 — Templates customizados pela UI admin
 *
 * Variáveis suportadas no template (formato `{{path.to.value}}`):
 *   {{contrato.id}} {{contrato.titulo}} {{contrato.valor_mensal}}
 *   {{contrato.valor_mensal_fmt}} (R$ formatado)
 *   {{contrato.data_inicio}} {{contrato.data_fim}}
 *   {{cliente.nome}} {{cliente.email}} {{cliente.telefone}}
 *   {{cliente.cnpj_cpf}} {{cliente.endereco}} {{cliente.cidade}}
 *   {{empresa.nome}} {{empresa.cnpj}} {{empresa.endereco}}
 *   {{hoje}} (data atual) {{hoje_extenso}} (por extenso)
 *
 * Variáveis calculadas:
 *   {{valor_extenso}} (valor por extenso)
 *   {{dias_contrato}} (dias entre início e fim)
 *
 * Para cada placeholder, o sistema é resiliente:
 *   - Se o valor não existir, mantém o placeholder original (debug-friendly)
 *   - Se for null/undefined, renderiza string vazia
 *   - Números são formatados como BRL
 *   - Datas são formatadas em PT-BR
 */

const crypto = require('crypto');
const { dbRun, dbGet, dbAll } = require('../database');

/**
 * Lista templates ativos (com filtro opcional por categoria).
 */
async function listar({ categoria, apenasAtivos = true, page = 0, size = 50 } = {}) {
    const wheres = [];
    const params = [];
    if (apenasAtivos) wheres.push('ativo = 1');
    if (categoria) { wheres.push('categoria = ?'); params.push(categoria); }
    const where = wheres.length ? ' WHERE ' + wheres.join(' AND ') : '';
    const limit = Math.min(parseInt(size) || 50, 200);
    const offset = parseInt(page) * limit;

    const rows = await dbAll(
        `SELECT id, slug, nome, descricao, categoria, tipo_contrato,
                ativo, versao, created_at, updated_at,
                length(html_content) as html_size
         FROM contract_templates${where}
         ORDER BY updated_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );
    return { data: rows, page: parseInt(page), size: limit };
}

/**
 * Busca template por ID.
 */
async function buscarPorId(id) {
    return dbGet('SELECT * FROM contract_templates WHERE id = ?', [id]);
}

/**
 * Busca template por slug.
 */
async function buscarPorSlug(slug) {
    return dbGet('SELECT * FROM contract_templates WHERE slug = ?', [slug]);
}

/**
 * Cria novo template.
 */
async function criar({ slug, nome, descricao, categoria, tipo_contrato, html_content, css_content, variables_json, created_by }) {
    if (!slug || !nome || !html_content) {
        const e = new Error('Campos obrigatórios: slug, nome, html_content');
        e.code = 'MISSING_REQUIRED';
        throw e;
    }

    // Validação de slug (apenas letras, números, hífen)
    if (!/^[a-z0-9-]+$/.test(slug)) {
        const e = new Error('slug deve ter apenas letras minúsculas, números e hífen');
        e.code = 'INVALID_SLUG';
        throw e;
    }

    const id = 'tpl_' + crypto.randomBytes(6).toString('hex');

    await dbRun(
        `INSERT INTO contract_templates
         (id, slug, nome, descricao, categoria, tipo_contrato, html_content, css_content, variables_json, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            id, slug, nome,
            descricao || null,
            categoria || 'geral',
            tipo_contrato || null,
            html_content,
            css_content || null,
            variables_json ? JSON.stringify(variables_json) : null,
            created_by || 'system',
        ]
    );
    return buscarPorId(id);
}

/**
 * Atualiza template (incrementa versão).
 */
async function atualizar(id, campos) {
    const allowed = ['nome', 'descricao', 'categoria', 'tipo_contrato', 'html_content', 'css_content', 'variables_json', 'ativo'];
    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(campos)) {
        if (allowed.includes(k)) {
            if (k === 'variables_json' && typeof v === 'object') {
                sets.push(`${k} = ?`); params.push(JSON.stringify(v));
            } else {
                sets.push(`${k} = ?`); params.push(v);
            }
        }
    }
    if (!sets.length) {
        const e = new Error('Nenhum campo válido para atualizar');
        e.code = 'NO_FIELDS';
        throw e;
    }

    // Incrementa versão quando o HTML muda
    if (campos.html_content) {
        sets.push('versao = versao + 1');
    }
    sets.push('updated_at = datetime(\'now\')');

    params.push(id);
    await dbRun(`UPDATE contract_templates SET ${sets.join(', ')} WHERE id = ?`, params);
    return buscarPorId(id);
}

/**
 * Duplica um template (cria uma cópia com slug derivado).
 */
async function duplicar(id, novoSlug) {
    const orig = await buscarPorId(id);
    if (!orig) {
        const e = new Error('Template não encontrado');
        e.code = 'NOT_FOUND';
        throw e;
    }
    const slug = novoSlug || `${orig.slug}-copia-${Date.now().toString(36)}`;
    return criar({
        slug,
        nome: `${orig.nome} (cópia)`,
        descricao: orig.descricao,
        categoria: orig.categoria,
        tipo_contrato: orig.tipo_contrato,
        html_content: orig.html_content,
        css_content: orig.css_content,
        variables_json: orig.variables_json ? JSON.parse(orig.variables_json) : null,
    });
}

/**
 * Soft delete (marca como inativo).
 */
async function remover(id) {
    await dbRun('UPDATE contract_templates SET ativo = 0, updated_at = datetime(\'now\') WHERE id = ?', [id]);
    return { success: true };
}

/**
 ╔════════════════════════════════════════════════════════════════════╗
 ║ RENDER ENGINE                                                    ║
 ╚════════════════════════════════════════════════════════════════════╝/

/**
 * Formata valor em BRL.
 */
function fmtCurrency(v) {
    const n = Number(v);
    if (isNaN(n)) return String(v || '');
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Formata data em PT-BR.
 */
function fmtDate(d) {
    if (!d) return '';
    const date = new Date(d);
    if (isNaN(date.getTime())) return String(d);
    return date.toLocaleDateString('pt-BR');
}

/**
 * Formata data por extenso.
 */
function fmtDateExtenso(d) {
    if (!d) return '';
    const date = new Date(d);
    if (isNaN(date.getTime())) return String(d);
    return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Valor por extenso (em reais) — simplificado.
 */
function valorExtenso(v) {
    const n = Number(v) || 0;
    const inteiro = Math.floor(n);
    const centavos = Math.round((n - inteiro) * 100);
    return `${inteiro} reais e ${centavos} centavos`;
}

/**
 * Calcula dias entre duas datas.
 */
function diasEntre(inicio, fim) {
    if (!inicio || !fim) return '';
    const d1 = new Date(inicio);
    const d2 = new Date(fim);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return '';
    return Math.ceil((d2 - d1) / 86400000);
}

/**
 * Converte data "YYYY-MM-DD" para "DD/MM/YYYY".
 */
function dateToBR(d) {
    if (!d) return '';
    if (typeof d !== 'string') return d;
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return d;
}

/**
 * Renderiza um template substituindo placeholders.
 *
 * @param {string} html - HTML do template
 * @param {Object} data - { cliente, contrato, empresa, ... }
 * @returns {string} HTML renderizado
 */
function render(html, data = {}) {
    if (!html) return '';

    // Enriquece data com campos calculados
    const enriched = enrichData(data);

    return html.replace(/\{\{\s*#?([\w.]+)\s*\}\}|\{\{\s*&([\w.]+)\s*\}\}/g, (match, path, path2) => {
        const actualPath = path || path2;
        return resolveValue(actualPath, enriched);
    });
}

function enrichData(data) {
    const enriched = JSON.parse(JSON.stringify(data));
    if (enriched.contrato) {
        enriched.contrato.valor_mensal_fmt = fmtCurrency(enriched.contrato.valor_mensal);
        enriched.contrato.valor_anual_fmt = fmtCurrency(enriched.contrato.valor_anual);
        enriched.contrato.data_inicio_fmt = fmtDate(enriched.contrato.data_inicio);
        enriched.contrato.data_fim_fmt = fmtDate(enriched.contrato.data_fim);
    }
    if (enriched.cliente) {
        enriched.cliente.nome_safe = enriched.cliente.nome || '';
        enriched.cliente.cnpj_cpf_fmt = enriched.cliente.cnpj_cpf || '';
    }
    enriched.hoje = fmtDate(new Date());
    enriched.hoje_extenso = fmtDateExtenso(new Date());
    if (enriched.contrato?.data_inicio && enriched.contrato?.data_fim) {
        enriched.dias_contrato = diasEntre(enriched.contrato.data_inicio, enriched.contrato.data_fim);
    }
    if (enriched.contrato?.valor_mensal) {
        enriched.valor_extenso = valorExtenso(enriched.contrato.valor_mensal);
    }
    return enriched;
}

function resolveValue(path, data) {
    const parts = path.split('.');
    let value = data;
    for (const part of parts) {
        if (value && typeof value === 'object' && part in value) {
            value = value[part];
        } else {
            return '';  // placeholder não encontrado → vazio (não mantém o {{}})
        }
    }
    if (value === null || value === undefined) return '';
    return String(value);
}

/**
 * Extrai lista de placeholders usados em um template.
 */
function extractPlaceholders(html) {
    const matches = [...html.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)];
    return [...new Set(matches.map(m => m[1]))];
}

/**
 * Renderiza template por ID com data.
 */
async function renderizarTemplate(templateId, data) {
    const tpl = await buscarPorId(templateId);
    if (!tpl) {
        const e = new Error('Template não encontrado');
        e.code = 'TEMPLATE_NOT_FOUND';
        throw e;
    }
    if (!tpl.ativo) {
        const e = new Error('Template inativo');
        e.code = 'TEMPLATE_INACTIVE';
        throw e;
    }

    const cssBlock = tpl.css_content
        ? `<style>${tpl.css_content}</style>`
        : '';

    const htmlRenderizado = render(tpl.html_content, data);
    return {
        templateId,
        slug: tpl.slug,
        versao: tpl.versao,
        html: `<!DOCTYPE html><html><head><meta charset="UTF-8">${cssBlock}</head><body>${htmlRenderizado}</body></html>`,
        placeholders: extractPlaceholders(tpl.html_content),
    };
}

/**
 * Seeds iniciais (templates padrão do Renostter).
 */
async function seedPadroes() {
    const padroes = [
        {
            slug: 'manutencao',
            nome: 'Contrato de Manutenção',
            descricao: 'Template padrão para contratos de manutenção preventiva/corretiva',
            categoria: 'manutencao',
            tipo_contrato: 'empresarial',
            html_content: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Contrato de Manutenção</title>
<style>
  body { font-family: 'Times New Roman', serif; max-width: 800px; margin: 40px auto; line-height: 1.6; color: #000; }
  h1 { text-align: center; font-size: 1.5em; text-transform: uppercase; border-bottom: 2px solid #000; padding-bottom: 10px; }
  h2 { font-size: 1.1em; margin-top: 1.5em; }
  .clausula { margin-bottom: 1em; text-align: justify; }
  .parties { display: flex; justify-content: space-between; margin: 30px 0; }
  .signature { margin-top: 60px; text-align: center; }
  .signature-line { border-top: 1px solid #000; width: 300px; margin: 0 auto; padding-top: 5px; }
</style></head><body>

<h1>Contrato de Prestação de Serviços de Manutenção</h1>

<p><strong>CONTRATO Nº:</strong> {{contrato.id}}<br>
<strong>Data:</strong> {{hoje_extenso}}</p>

<h2>1. PARTES</h2>
<div class="clausula">
  <p><strong>CONTRATANTE:</strong> {{cliente.nome}}, inscrito(a) no CPF/CNPJ sob nº {{cliente.cnpj_cpf}}, com sede em {{cliente.endereco}}, {{cliente.cidade}}/{{cliente.estado}}.</p>
  <p><strong>CONTRATADA:</strong> {{empresa.nome}}, inscrita no CNPJ sob nº {{empresa.cnpj}}, com sede em {{empresa.endereco}}.</p>
</div>

<h2>2. OBJETO</h2>
<p class="clausula">Prestação de serviços contínuos de manutenção preventiva e corretiva em equipamentos de climatização, conforme plano contratado.</p>

<h2>3. VIGÊNCIA</h2>
<p class="clausula">O presente contrato vigorará de <strong>{{contrato.data_inicio_fmt}}</strong> até <strong>{{contrato.data_fim_fmt}}</strong>, perfazendo {{dias_contrato}} dias.</p>

<h2>4. VALOR E PAGAMENTO</h2>
<p class="clausula">4.1. Pela prestação dos serviços, a CONTRATANTE pagará à CONTRATADA o valor mensal de <strong>{{contrato.valor_mensal_fmt}}</strong> ({{valor_extenso}}).</p>
<p class="clausula">4.2. O pagamento será efetuado mensalmente, via boleto bancário ou PIX, com vencimento todo dia 5 (cinco) de cada mês.</p>
<p class="clausula">4.3. Em caso de atraso, serão aplicados juros de mora de 1% ao mês e multa de 2% sobre o valor devido.</p>

<h2>5. OBRIGAÇÕES DA CONTRATADA</h2>
<p class="clausula">5.1. Atender chamados técnicos no prazo máximo de {{contrato.sla_resposta_horas}} horas e concluir o serviço em até {{contrato.sla_resolucao_horas}} horas.</p>
<p class="clausula">5.2. Manter equipe técnica qualificada e utilizar peças originais ou homologadas.</p>
<p class="clausula">5.3. Emitir relatório de visita a cada atendimento.</p>

<h2>6. OBRIGAÇÕES DA CONTRATANTE</h2>
<p class="clausula">6.1. Garantir acesso aos equipamentos nos horários agendados.</p>
<p class="clausula">6.2. Efetuar os pagamentos nas datas acordadas.</p>
<p class="clausula">6.3. Não intervir nos equipamentos sem autorização.</p>

<h2>7. RESCISÃO</h2>
<p class="clausula">7.1. Qualquer das partes pode rescindir o presente contrato mediante aviso prévio de 30 (trinta) dias.</p>
<p class="clausula">7.2. Em caso de descumprimento de qualquer cláusula, a parte inocente pode rescindir imediatamente, sem prejuízo de indenização.</p>

<h2>8. FORO</h2>
<p class="clausula">Fica eleito o foro de {{empresa.cidade}}/{{empresa.estado}} para dirimir quaisquer questões oriundas do presente contrato.</p>

<br><br>

<div class="signature">
  <div class="signature-line">{{cliente.nome}} — CONTRATANTE</div>
  <br>
  <div class="signature-line">{{empresa.nome}} — CONTRATADA</div>
</div>

</body></html>`,
        },
        {
            slug: 'pmoc',
            nome: 'Contrato PMOC (ABNT NBR 16020)',
            descricao: 'Plano de Manutenção, Operação e Controle — obrigatório para equipamentos ≥ 75.000 BTU/h',
            categoria: 'pmoc',
            tipo_contrato: 'pmoc',
            html_content: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Contrato PMOC</title></head><body>
<h1 style="text-align:center">CONTRATO PMOC</h1>
<h2>Plano de Manutenção, Operação e Controle</h2>
<p><strong>Nº:</strong> {{contrato.id}} | <strong>Cliente:</strong> {{cliente.nome}} | <strong>CNPJ/CPF:</strong> {{cliente.cnpj_cpf}}</p>
<p>Conforme ABNT NBR 16020, para equipamentos de climatização com potência superior a 75.000 BTU/h.</p>
<p>Valor mensal: <strong>{{contrato.valor_mensal_fmt}}</strong></p>
<p>Vigência: {{contrato.data_inicio_fmt}} a {{contrato.data_fim_fmt}}</p>
</body></html>`,
        },
    ];

    const results = [];
    for (const tpl of padroes) {
        try {
            const existing = await buscarPorSlug(tpl.slug);
            if (existing) {
                results.push({ slug: tpl.slug, status: 'já existe' });
                continue;
            }
            await criar(tpl);
            results.push({ slug: tpl.slug, status: 'criado' });
        } catch (e) {
            results.push({ slug: tpl.slug, status: 'erro', error: e.message });
        }
    }
    return results;
}

module.exports = {
    listar,
    buscarPorId,
    buscarPorSlug,
    criar,
    atualizar,
    duplicar,
    remover,
    render,
    renderizarTemplate,
    extractPlaceholders,
    seedPadroes,
    fmtCurrency,
    fmtDate,
    fmtDateExtenso,
};
