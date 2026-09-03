const { test, expect } = require('@playwright/test');

test.describe('Renostter CRM - Financial Flow E2E', () => {
  
  test('Technician adds part and Admin approves it, creating an invoice', async ({ browser }) => {
    const techContext = await browser.newContext();
    const techPage = await techContext.newPage();
    
    // Handle dialogs early
    techPage.on('dialog', async dialog => {
      console.log('TECH DIALOG:', dialog.message());
      await dialog.accept();
    });

    techPage.on('console', msg => console.log('TECH PAGE LOG:', msg.text()));

    await techPage.goto('http://127.0.0.1:8080/');
    await techPage.waitForLoadState('networkidle');

    // Select Technician Tab
    await techPage.click('.portal-tab[data-role="tecnico"]');
    await techPage.fill('#loginEmail', 'tecnico@renostter.com');
    await techPage.fill('#loginPassword', 'tech123');
    await techPage.click('.btn-login');

    await techPage.waitForURL(/\/tech\/dashboard\.html/, { timeout: 15000 });
    await techPage.goto('http://127.0.0.1:8080/tech/tickets.html');

    // Open first ticket
    const ticketRow = techPage.locator('#ticketsTable tr').first();
    await expect(ticketRow).toBeVisible({ timeout: 15000 });
    const ticketNum = await ticketRow.locator('td').first().innerText();
    console.log(`Working on ticket: ${ticketNum}`);
    await ticketRow.click();

    // Add a Part
    const addPartBtn = techPage.locator('button:has-text("Adicionar Peça")').first();
    await expect(addPartBtn).toBeVisible({ timeout: 10000 });
    await addPartBtn.click();
    
    await techPage.fill('#partSearch', 'Capacitor');
    const firstPartAddBtn = techPage.locator('#partList button:has-text("Add")').first();
    await expect(firstPartAddBtn).toBeVisible({ timeout: 10000 });
    await firstPartAddBtn.click(); 
    
    await techPage.keyboard.press('Escape'); // Close modal if needed

    // Send for approval
    const submitProposalBtn = techPage.locator('#btnSubmitProposal');
    await expect(submitProposalBtn).toBeEnabled({ timeout: 10000 });
    await submitProposalBtn.click();
    console.log('Proposal sent for approval');

    // 2. ADMIN APPROVAL
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    adminPage.on('dialog', async dialog => {
        console.log('ADMIN DIALOG:', dialog.message());
        await dialog.accept();
    });
    adminPage.on('console', msg => console.log('ADMIN PAGE LOG:', msg.text()));
    
    await adminPage.goto('http://127.0.0.1:8080/');
    await adminPage.click('.portal-tab[data-role="admin"]');
    await adminPage.fill('#loginEmail', 'admin@renostter.com');
    await adminPage.fill('#loginPassword', 'admin123');
    await adminPage.click('.btn-login');

    await adminPage.waitForSelector('#twofaDisplay', { timeout: 15000 });
    const faCode = await adminPage.innerText('#twofaDisplay');
    await adminPage.fill('#twofaInput', faCode);
    await adminPage.click('button:has-text("Verificar e Entrar")');

    await adminPage.waitForURL(/\/admin\/dashboard\.html/, { timeout: 15000 });
    await adminPage.goto('http://127.0.0.1:8080/admin/tickets.html');

    await adminPage.fill('#searchInput', ticketNum);
    const adminTicketRow = adminPage.locator(`#ticketsTable tr:has-text("${ticketNum}")`).first();
    await expect(adminTicketRow).toBeVisible();
    await adminTicketRow.click();

    const partSelect = adminPage.locator('#ticketPartsList select').first();
    await expect(partSelect).toBeVisible({ timeout: 10000 });
    await partSelect.selectOption('aprovado');
    
    console.log('Part approved by admin');
    await adminPage.waitForTimeout(4000); // Wait for API sync

    // 3. VERIFY
    await adminPage.goto('http://127.0.0.1:8080/admin/cobrancas.html');
    await expect(adminPage.locator('table')).toBeVisible({ timeout: 15000 });
    const billingRef = adminPage.locator(`td:has-text("Chamado ${ticketNum}")`).first();
    await expect(billingRef).toBeVisible({ timeout: 20000 });
    
    console.log(`Flow completed for ticket ${ticketNum}`);
    await browser.close();
  });
});
