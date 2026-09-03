/**
 * CEP Migration Script
 * Removes hyphens from all CEP values in clients and suppliers.
 */
function migrateCeps() {
    console.log("Starting CEP migration...");

    // Clients
    const clients = JSON.parse(localStorage.getItem('db_clients') || '[]');
    let clientsChanged = 0;
    const migratedClients = clients.map(c => {
        if (c.cep && c.cep.includes('-')) {
            c.cep = c.cep.replace(/\D/g, '');
            clientsChanged++;
            return c;
        }
        return c;
    });
    localStorage.setItem('db_clients', JSON.stringify(migratedClients));
    console.log(`Clients migrated: ${clientsChanged}`);

    // Suppliers
    const suppliers = JSON.parse(localStorage.getItem('db_suppliers') || '[]');
    let suppliersChanged = 0;
    const migratedSuppliers = suppliers.map(s => {
        if (s.cep && s.cep.includes('-')) {
            s.cep = s.cep.replace(/\D/g, '');
            suppliersChanged++;
            return s;
        }
        return s;
    });
    localStorage.setItem('db_suppliers', JSON.stringify(migratedSuppliers));
    console.log(`Suppliers migrated: ${suppliersChanged}`);

    console.log("Migration complete.");
}

// Execute migration
migrateCeps();
