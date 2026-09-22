/* Extraido de tech/inventory.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('auth', function () { return typeof auth !== 'undefined' ? auth : undefined; }, function (v) { auth = v; });
  def('renderCards', function () { return typeof renderCards !== 'undefined' ? renderCards : undefined; }, function (v) { renderCards = v; });
})();
/* ── fim do bloco gerado ── */

        const session = auth.protect(['tecnico']);
        const CAT_LABELS = { eletrica: '⚡ Elétrica', eletronica: '🔌 Eletrônica', mecanica: '⚙️ Mecânica', consumivel: '🧴 Consumível', outros: '📦 Outros' };

        function stockColor(p) { if (p.currentStock <= 0) return '#8B949E'; if (p.currentStock <= p.minStock) return '#DA3633'; if (p.currentStock <= p.safetyStock) return '#D29922'; return '#2EA043'; }
        function stockLabel(p) { if (p.currentStock <= 0) return 'Sem estoque'; if (p.currentStock <= p.minStock) return '⚠️ Estoque低'; return 'Disponível'; }

        function renderCards() {
            const q = (document.getElementById('searchInput').value || '').toLowerCase();
            const cat = document.getElementById('fCat').value;
            const avail = document.getElementById('fAvail').value;
            let items = db.get('inventory').filter(p => p.status === 'ativo');
            if (q) items = items.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.category || '').includes(q) || (p.description || '').toLowerCase().includes(q));
            if (cat) items = items.filter(p => p.category === cat);
            if (avail === 'available') items = items.filter(p => p.currentStock > 0);
            if (avail === 'zero') items = items.filter(p => p.currentStock <= 0);
            document.getElementById('resultCount').textContent = `${items.length} produto(s) encontrado(s)`;
            document.getElementById('partsGrid').innerHTML = items.map(p => `
    <div class="part-card">
      <div class="part-img">${p.imageBase64 ? `<img src="${p.imageBase64}">` : '📦'}</div>
      <div>
        <div style="font-weight:600;font-size:.95rem;margin-bottom:2px">${esc(p.name)}</div>
        <div style="font-size:.75rem;color:var(--text-secondary)">SKU: ${esc(p.sku)} · ${CAT_LABELS[p.category] || p.category || '—'}</div>
      </div>
      <div style="display:flex;align-items:baseline;gap:6px">
        <span class="stock-num" style="color:${stockColor(p)}">${p.currentStock}</span>
        <span style="font-size:.8rem;color:var(--text-secondary)">${p.unit} disponível${p.currentStock !== 1 ? 'is' : ''}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        ${p.location ? `<span class="loc-badge">📍 ${esc(p.location)}</span>` : ''}
        <span style="font-size:.72rem;color:${stockColor(p)}">${stockLabel(p)}</span>
      </div>
      ${p.description ? `<div style="font-size:.75rem;color:var(--text-muted);border-top:1px solid var(--border);padding-top:8px">${esc(p.description.slice(0, 100))}${p.description.length > 100 ? '…' : ''}</div>` : ''}
    </div>`).join('') || '<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--text-secondary)"><div style="font-size:3rem;margin-bottom:10px">🔍</div><div>Nenhum produto encontrado</div></div>';
        }

        renderCards(); initSidebar();
    
