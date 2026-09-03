// Validação final de TODOS os guias
const { chromium } = require('playwright');

const docs = [
    { url: '/crm/docs/README.md' },
    { url: '/crm/docs/guia-cotacao.html' },
    { url: '/crm/docs/guia-pmoc.html' },
    { url: '/crm/docs/guia-contratos.html' },
    { url: '/crm/docs/guia-leads.html' },
    { url: '/crm/docs/guia-chamados.html' },
    { url: '/crm/docs/guia-bi.html' },
    { url: '/crm/docs/guia-garantia.html' },
    { url: '/crm/docs/guia-estoque.html' },
    { url: '/crm/docs/guia-cotacao.md' },
    { url: '/crm/docs/guia-pmoc.md' },
    { url: '/crm/docs/guia-contratos.md' },
    { url: '/crm/docs/guia-leads.md' },
    { url: '/crm/docs/guia-chamados.md' },
    { url: '/crm/docs/guia-bi.md' },
    { url: '/crm/docs/guia-garantia.md' },
    { url: '/crm/docs/guia-estoque.md' }
];

(async () => {
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    let totalH = 0, totalM = 0, totalS = 0, totalI = 0;

    console.log('📚 Validação final - ' + docs.length + ' documentos:\n');
    for (const d of docs) {
        const r = await page.goto(`http://localhost:3000${d.url}`, { waitUntil: 'load', timeout: 15000 });
        const name = d.url.split('/').pop();
        if (d.url.endsWith('.html')) {
            const h1 = await page.locator('h1').first().textContent().catch(() => '?');
            const sections = await page.locator('h2[id]').count();
            const imgs = await page.locator('.shot img').count();
            const allImgs = await page.locator('.shot img').evaluateAll(els => els.map(e => ({ ok: e.complete && e.naturalWidth > 0 })));
            const loaded = allImgs.filter(i => i.ok).length;
            console.log(`  ${r.status()}  ${name.padEnd(28)} | ${sections} seções | ${loaded}/${imgs} imgs | H1: "${h1.substring(0, 50)}"`);
            totalH++; totalS += sections; totalI += loaded;
        } else {
            const size = (await r.body()).length;
            console.log(`  ${r.status()}  ${name.padEnd(28)} | ${(size/1024).toFixed(1)} KB`);
            totalM += size;
        }
    }
    await browser.close();
    console.log(`\n📊 TOTAIS:`);
    console.log(`   ${totalH} guias HTML com ${totalS} seções e ${totalI} imagens validadas`);
    console.log(`   ${docs.length - totalH} guias MD com ${(totalM/1024).toFixed(1)} KB total`);
})();
