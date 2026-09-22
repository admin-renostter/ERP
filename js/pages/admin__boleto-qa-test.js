/* Extraido de admin/boleto-qa-test.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
        // Gerar representação visual do código de barras
        const barcode = '40391141700000250000000048808662000020136601';
        const container = document.getElementById('barcodeVisual');
        for (let i = 0; i < barcode.length; i++) {
            const digit = parseInt(barcode[i]);
            // Simular barras baseadas nos dígitos
            const w = (digit % 3 === 0) ? 3 : (digit % 2 === 0) ? 2 : 1;
            const isBar = i % 2 === 0;
            const el = document.createElement('div');
            el.className = isBar ? 'bar' : 'space';
            el.style.width = w + 'px';
            container.appendChild(el);
            // Adicionar barras finas entre
            if (i < barcode.length - 1) {
                const thin = document.createElement('div');
                thin.className = isBar ? 'space' : 'bar';
                thin.style.width = '1px';
                container.appendChild(thin);
            }
        }
    
