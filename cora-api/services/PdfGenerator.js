/**
 * PdfGenerator — Gera PDF de contrato a partir de template HTML
 *
 * Sprint 8 — Automação de contratos
 *
 * Usa puppeteer (Chromium headless) se disponível, ou fallback para
 * um gerador puro em Node (pdf-lib) se não.
 *
 * Templates disponíveis em /cora-api/templates/contracts/*.html
 * Aceitam placeholders {{cliente.nome}}, {{contrato.id}}, etc.
 *
 * Em prod, recomenda-se instalar puppeteer (com Chromium) para
 * renderizar HTML com CSS completo.
 */

const path = require('path');
const fs = require('fs');

const IS_PROD = process.env.NODE_ENV === 'production';
const PDF_ENGINE = process.env.PDF_ENGINE || 'auto'; // 'auto' | 'puppeteer' | 'pdfkit' | 'pdf-lib'

let _engine = null;
let _engineName = null;

async function getEngine() {
    if (_engine) return _engine;

    // Tenta puppeteer primeiro (melhor renderização)
    if (PDF_ENGINE === 'auto' || PDF_ENGINE === 'puppeteer') {
        try {
            const puppeteer = require('puppeteer');
            _engine = {
                name: 'puppeteer',
                render: async (html) => {
                    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
                    try {
                        const page = await browser.newPage();
                        await page.setContent(html, { waitUntil: 'networkidle0' });
                        return await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' } });
                    } finally {
                        await browser.close();
                    }
                },
            };
            _engineName = 'puppeteer';
            return _engine;
        } catch (e) {
            console.log('[PdfGenerator] puppeteer não disponível, tentando próximo...');
        }
    }

    // Tenta pdf-lib (puro JS, sem Chromium)
    if (PDF_ENGINE === 'auto' || PDF_ENGINE === 'pdf-lib') {
        try {
            const { PDFDocument: PDFLib, StandardFonts, rgb } = require('pdf-lib');
            _engine = {
                name: 'pdf-lib',
                render: async (html) => {
                    const pdfDoc = await PDFLib.create();
                    const page = pdfDoc.addPage([595, 842]); // A4
                    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
                    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
                    // Extrai texto do HTML (remove tags)
                    const text = stripHtml(html);
                    const lines = wrapText(text, font, 11, 520);
                    let y = 800;
                    for (const line of lines) {
                        if (y < 50) break;
                        page.drawText(line, { x: 50, y, size: 11, font });
                        y -= 14;
                    }
                    return Buffer.from(await pdfDoc.save());
                },
            };
            _engineName = 'pdf-lib';
            return _engine;
        } catch (e) {
            console.log('[PdfGenerator] pdf-lib não disponível:', e.message);
        }
    }

    // Fallback: PDF mínimo válido (sem formatação)
    _engine = {
        name: 'minimal',
        render: async (html, meta = {}) => {
            const text = stripHtml(html);
            return Buffer.from(makeMinimalPdf(text, meta), 'utf-8');
        },
    };
    _engineName = 'minimal';
    return _engine;
}

function stripHtml(html) {
    return String(html || '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/h[1-6]>/gi, '\n\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function wrapText(text, font, size, maxWidth) {
    const lines = text.split('\n');
    const wrapped = [];
    for (const line of lines) {
        if (!line.trim()) { wrapped.push(''); continue; }
        const words = line.split(' ');
        let current = '';
        for (const word of words) {
            const test = current ? current + ' ' + word : word;
            const width = font.widthOfTextAtSize(test, size);
            if (width > maxWidth) {
                if (current) wrapped.push(current);
                current = word;
            } else {
                current = test;
            }
        }
        if (current) wrapped.push(current);
    }
    return wrapped;
}

function makeMinimalPdf(text, meta = {}) {
    const lines = (text || 'Documento Renostter CRM').split('\n').slice(0, 50);
    const lineHeight = 16;
    const pageHeight = 792;
    const startY = pageHeight - 60;

    let content = `BT /F1 12 Tf 50 ${startY} Td 14 TL\n`;
    for (let i = 0; i < lines.length; i++) {
        const y = startY - (i * lineHeight);
        if (y < 50) break;
        const safe = lines[i].replace(/[()\\]/g, m => m === '(' ? '\\(' : m === ')' ? '\\)' : '\\\\');
        content += `${safe.length > 90 ? safe.substring(0, 87) + '...' : safe}\n`;
    }
    content += 'ET';

    const stream = `q
${content}
Q`;

    return `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj
4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
5 0 obj << /Length ${stream.length} >> stream
${stream}
endstream endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000056 00000 n
0000000111 00000 n
0000000202 00000 n
0000000257 00000 n
trailer << /Size 6 /Root 1 0 R >>
startxref
370
%%EOF`;
}

/**
 * Renderiza um template de contrato com placeholders.
 *
 * Sprint 11: agora consulta o TemplateService primeiro. Se existir template
 * ativo no banco, usa ele. Senão, cai pro arquivo .html em /templates/contracts.
 *
 * @param {string} templateName - slug ou nome do template (ex: "manutencao")
 * @param {Object} data - dados para substituir (ex: {cliente: {nome: 'João'}, contrato: {id: 'ct_1'}})
 * @returns {Promise<Buffer>} PDF buffer
 */
async function renderContract(templateName, data) {
    const engine = await getEngine();
    let html;

    // 1) Tenta buscar template do banco (Sprint 11)
    try {
        const TemplateService = require('./TemplateService');
        let tpl = null;
        // Primeiro tenta por slug, depois por nome
        tpl = await TemplateService.buscarPorSlug(templateName).catch(() => null);
        if (!tpl) {
            // Tenta listar e achar pelo nome
            const lista = await TemplateService.listar({ apenasAtivos: true, size: 200 });
            tpl = lista.data.find(t => t.nome.toLowerCase().includes(templateName.toLowerCase())
                                    || t.slug === templateName);
        }
        if (tpl && tpl.ativo) {
            const result = await TemplateService.renderizarTemplate(tpl.id, data);
            html = result.html;
        }
    } catch (e) {
        // Cai pro fallback
    }

    // 2) Fallback: arquivo em /templates/contracts/
    if (!html) {
        const templatesDir = path.resolve(__dirname, '..', 'templates', 'contracts');
        const templatePath = path.join(templatesDir, `${templateName}.html`);
        if (fs.existsSync(templatePath)) {
            html = fs.readFileSync(templatePath, 'utf-8');
        } else {
            html = generateFallbackTemplate(templateName, data);
        }
        html = interpolate(html, data);
        // envelopa em HTML completo
        html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${html}</body></html>`;
    }

    return await engine.render(html, { templateName, data });
}

function interpolate(template, data) {
    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, path) => {
        const parts = path.split('.');
        let value = data;
        for (const part of parts) {
            if (value && typeof value === 'object' && part in value) {
                value = value[part];
            } else {
                return match; // mantém placeholder se não encontrar
            }
        }
        if (value === null || value === undefined) return '';
        if (typeof value === 'number') {
            return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        }
        return String(value);
    });
}

function generateFallbackTemplate(name, data) {
    const today = new Date().toLocaleDateString('pt-BR');
    const valor = data?.contrato?.valor_mensal ? Number(data.contrato.valor_mensal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '__________';
    return `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${name}</title></head>
<body style="font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; line-height: 1.6;">
  <h1 style="text-align: center;">CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>
  <h2 style="text-align: center;">Renostter Climatização</h2>
  <p><strong>Data:</strong> ${today}</p>
  <p><strong>Contrato:</strong> {{contrato.id}}</p>
  <hr>
  <h3>1. PARTES</h3>
  <p><strong>CONTRATANTE:</strong> {{cliente.nome}}, inscrito(a) no CPF/CNPJ sob nº {{cliente.cnpj_cpf}}.</p>
  <p><strong>CONTRATADA:</strong> Renostter Climatização Ltda, CNPJ XX.XXX.XXX/0001-XX.</p>
  <h3>2. OBJETO</h3>
  <p>Prestação de serviços de manutenção e instalação de equipamentos de climatização.</p>
  <h3>3. VALOR</h3>
  <p>Mensalidade: <strong>${valor}</strong></p>
  <h3>4. VIGÊNCIA</h3>
  <p>Início: {{contrato.data_inicio}} | Fim: {{contrato.data_fim}}</p>
  <h3>5. CLÁUSULAS</h3>
  <p>5.1. A CONTRATADA prestará os serviços conforme SLA do plano contratado.</p>
  <p>5.2. O pagamento será mensal, via boleto bancário ou PIX.</p>
  <p>5.3. A rescisão pode ser feita por qualquer parte, com aviso prévio de 30 dias.</p>
  <br><br>
  <p style="text-align: center;">___________________________<br>{{cliente.nome}}</p>
</body></html>`.trim();
}

module.exports = {
    renderContract,
    getEngineName: async () => { await getEngine(); return _engineName; },
};
