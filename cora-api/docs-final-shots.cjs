// Screenshot BI, Garantia, Estoque
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

    // ═══ BI ═══
    const biPage = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await biPage.goto('http://localhost:3000/crm/admin/bi.html', { waitUntil: 'networkidle' });
    await biPage.waitForTimeout(4000);
    await biPage.screenshot({ path: 'guia-bi-1.png', fullPage: false });
    console.log('✓ guia-bi-1.png (topo)');
    // Scroll para ver a parte de baixo
    await biPage.evaluate(() => window.scrollTo(0, 1200));
    await biPage.waitForTimeout(1500);
    await biPage.screenshot({ path: 'guia-bi-2.png', fullPage: false });
    console.log('✓ guia-bi-2.png (meio)');
    await biPage.close();

    // ═══ GARANTIA ═══
    const garPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    // Login necessário?
    await garPage.goto('http://localhost:3000/crm/admin/garantia.html', { waitUntil: 'networkidle' });
    await garPage.waitForTimeout(2500);
    await garPage.screenshot({ path: 'guia-garantia-1.png', fullPage: false });
    console.log('✓ guia-garantia-1.png');
    await garPage.close();

    // ═══ ESTOQUE ═══
    const estPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await estPage.goto('http://localhost:3000/crm/admin/inventory.html', { waitUntil: 'networkidle' });
    await estPage.waitForTimeout(3000);
    await estPage.screenshot({ path: 'guia-estoque-1.png', fullPage: false });
    console.log('✓ guia-estoque-1.png');
    await estPage.close();

    await browser.close();
    console.log('\n✅ Screenshots prontos');
})();
