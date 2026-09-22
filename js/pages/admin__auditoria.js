/* Extraido de admin/auditoria.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('$', function () { return typeof $ !== 'undefined' ? $ : undefined; }, function (v) { $ = v; });
  def('auditCurrentPage', function () { return typeof auditCurrentPage !== 'undefined' ? auditCurrentPage : undefined; }, function (v) { auditCurrentPage = v; });
  def('auth', function () { return typeof auth !== 'undefined' ? auth : undefined; }, function (v) { auth = v; });
  def('exportAudit', function () { return typeof exportAudit !== 'undefined' ? exportAudit : undefined; }, function (v) { exportAudit = v; });
  def('renderAudit', function () { return typeof renderAudit !== 'undefined' ? renderAudit : undefined; }, function (v) { renderAudit = v; });
  def('totalPages', function () { return typeof totalPages !== 'undefined' ? totalPages : undefined; }, function (v) { totalPages = v; });
})();
/* ── fim do bloco gerado ── */

        // ─── Auth + gate superadmin ───
        const session = auth.protect(['superadmin']);
        if (session.role === 'superadmin') {
            const navItem = document.getElementById('auditNavItem');
            if (navItem) navItem.style.display = '';
        }
        initSidebar();

        // ─── Audit constants ───
        let auditCurrentPage = 1;
        const AUDIT_ITEMS_PER_PAGE = 50;

        function getAuditIcon(action) {
            const icons = {
                'login': '🟢', 'logout': '🔴', 'transfer': '🔄', 'password_change': '🔑',
                'create_ticket': '🎫', 'doc_upload': '📎', 'doc_replace': '📝', 'doc_delete': '🗑️',
                'ticket_resolved': '✅', 'ticket_status_change': '📈',
                'inventory_move': '📦'
            };
            return icons[action] || '⚙️';
        }

        function populateAuditUsers() {
            const users = db.get('users');
            const sel = document.getElementById('auditUser');
            if (!sel) return;
            sel.innerHTML = '<option value="">Todos os usuários</option>' +
                users.map(u => `<option value="${esc(u.id)}">${esc(u.name)}</option>`).join('');
        }

        function renderAudit(page = 1) {
            auditCurrentPage = page;
            const action = document.getElementById('auditAction').value;
            const userId = document.getElementById('auditUser').value;
            const search = (document.getElementById('auditSearch').value || '').toLowerCase();
            const sDate = document.getElementById('auditStart').value;
            const eDate = document.getElementById('auditEnd').value;

            let logs = [...db.get('auditlog')].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            if (action) logs = logs.filter(l => l.action === action);
            if (userId) logs = logs.filter(l => l.userId === userId);
            if (search) {
                logs = logs.filter(l =>
                    (l.userName || '').toLowerCase().includes(search) ||
                    (l.details || '').toLowerCase().includes(search) ||
                    (l.action || '').toLowerCase().includes(search)
                );
            }
            if (sDate) {
                const sTime = new Date(sDate + 'T00:00:00').getTime();
                logs = logs.filter(l => new Date(l.createdAt).getTime() >= sTime);
            }
            if (eDate) {
                const eTime = new Date(eDate + 'T23:59:59').getTime();
                logs = logs.filter(l => new Date(l.createdAt).getTime() <= eTime);
            }

            document.getElementById('auditCount').textContent =
                `(${logs.length} registro${logs.length === 1 ? '' : 's'} encontrado${logs.length === 1 ? '' : 's'})`;

            const totalPages = Math.ceil(logs.length / AUDIT_ITEMS_PER_PAGE);
            const startIdx = (auditCurrentPage - 1) * AUDIT_ITEMS_PER_PAGE;
            const paginatedLogs = logs.slice(startIdx, startIdx + AUDIT_ITEMS_PER_PAGE);

            document.getElementById('auditList').innerHTML = paginatedLogs.length ? paginatedLogs.map(l => {
                const dt = new Date(l.createdAt);
                const dateStr = isNaN(dt.getTime()) ? '—' : fmt.date(l.createdAt);
                const hourStr = isNaN(dt.getTime()) ? '' : dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                return `
    <div class="audit-card">
      <div class="audit-icon">${getAuditIcon(l.action)}</div>
      <div class="audit-detail">
        <div><strong>${esc(l.userName)}</strong>
          <span class="role-badge">${l.userRole === 'superadmin' ? 'Administrador Master' : esc(l.userRole)}</span>
        </div>
        <div class="audit-desc">${esc(l.details || `Ação: ${l.action}`)}</div>
      </div>
      <div class="audit-when">
        <div class="audit-date">${dateStr}</div>
        <div>${hourStr}</div>
      </div>
    </div>`;
            }).join('') : `<div style="text-align:center;padding:48px 24px;color:var(--text-secondary);background:var(--bg-surface);border-radius:8px">Nenhum log encontrado para os filtros selecionados.</div>`;

            const pagEl = document.getElementById('auditPagination');
            if (totalPages > 1) {
                let html = `<button class="btn btn-ghost btn-sm" data-on-click="renderAudit(${Math.max(1, auditCurrentPage - 1)})" ${auditCurrentPage === 1 ? 'disabled' : ''}>Anterior</button>`;
                html += `<span style="display:flex;align-items:center;padding:0 12px;font-size:0.8rem;color:var(--text-muted)">Página ${auditCurrentPage} de ${totalPages}</span>`;
                html += `<button class="btn btn-ghost btn-sm" data-on-click="renderAudit(${Math.min(totalPages, auditCurrentPage + 1)})" ${auditCurrentPage === totalPages ? 'disabled' : ''}>Próxima</button>`;
                pagEl.innerHTML = html;
            } else {
                pagEl.innerHTML = '';
            }
        }

        function exportAudit() {
            const action = document.getElementById('auditAction').value;
            const userId = document.getElementById('auditUser').value;
            const search = (document.getElementById('auditSearch').value || '').toLowerCase();
            const sDate = document.getElementById('auditStart').value;
            const eDate = document.getElementById('auditEnd').value;

            let logs = [...db.get('auditlog')].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            if (action) logs = logs.filter(l => l.action === action);
            if (userId) logs = logs.filter(l => l.userId === userId);
            if (search) logs = logs.filter(l =>
                (l.userName || '').toLowerCase().includes(search) ||
                (l.details || '').toLowerCase().includes(search) ||
                (l.action || '').toLowerCase().includes(search));
            if (sDate) logs = logs.filter(l => new Date(l.createdAt).getTime() >= new Date(sDate + 'T00:00:00').getTime());
            if (eDate) logs = logs.filter(l => new Date(l.createdAt).getTime() <= new Date(eDate + 'T23:59:59').getTime());

            exportCSV(
                logs.map(l => ({
                    acao: l.action,
                    usuario: l.userName,
                    papel: l.userRole,
                    detalhes: l.details,
                    data: fmt.datetime(l.createdAt)
                })),
                'audit-log-filtrado.csv'
            );
            toast('Auditoria exportada', 'Exportando apenas dados filtrados.', 'success');
        }

        // ─── Init ───
        document.addEventListener('DOMContentLoaded', () => {
            try { initSidebar(); } catch (e) { /* already initialized */ }
            populateAuditUsers();
            renderAudit();
        });
    
