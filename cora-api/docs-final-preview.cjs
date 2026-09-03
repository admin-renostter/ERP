// Screenshot final dos 3 guias novos
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    for (const url of ['/crm/docs/guia-bi.html', '/crm/docs/guia-garantia.html', '/crm/docs/guia-estoque.html']) {
        await page.goto(`http://localhost:3000${url}`, { waitUntil: 'load' });
        await page.waitForTimeout(1500);
        const name = url.split('/').pop().replace('.html', '');
        await page.screenshot({ path: `preview-${name}.png`, fullPage: false });
        console.log(`✓ preview-${name}.png`);
    }

    await browser.close();
})();
