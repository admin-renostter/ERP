/**
 * RENOSTTER CRM — Utilities
 */

/* ─── XSS Sanitization ─── */
/**
 * Escape HTML characters to prevent XSS when injecting untrusted
 * user data into innerHTML templates.
 */
function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/* ─── Date/time formatting ─── */
const fmt = {
    date(iso) { if (!iso) return ''; try { return new Date(iso).toLocaleDateString('pt-BR'); } catch { return ''; } },
    datetime(iso) { if (!iso) return ''; try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return ''; } },
    relative(iso) {
        if (!iso) return '';
        try {
            const diff = Date.now() - new Date(iso).getTime();
            const s = diff / 1000, m = s / 60, h = m / 60, d = h / 24;
            if (s < 60) return 'agora';
            if (m < 60) return Math.floor(m) + 'min atrás';
            if (h < 24) return Math.floor(h) + 'h atrás';
            if (d < 7) return Math.floor(d) + 'd atrás';
            return fmt.date(iso);
        } catch { return ''; }
    },
    currency(v) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0); },
    cnpj(v) { return (v || '').replace(/\D/g, '').replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'); },
    phone(v) { v = (v || '').replace(/\D/g, ''); if (v.length === 11) return v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3'); return v.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3'); },
    // Numeric/Money parsing (supports R$, dots, and commas)
    parseMoney: (val) => {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        let s = val.toString().replace(/[R$\s]/g, '');
        const commaIdx = s.lastIndexOf(',');
        const dotIdx = s.lastIndexOf('.');
        if (commaIdx > dotIdx) {
            // Brazilian format: 1.234,56 or 1234,56
            s = s.replace(/\./g, '').replace(',', '.');
        } else if (dotIdx > commaIdx && commaIdx !== -1) {
            // International with thousands: 1,234.56
            s = s.replace(/,/g, '');
        }
        return parseFloat(s) || 0;
    },

    // Basic XML/HTML sanitization to prevent XXE/XSS (simple implementation)
    sanitizeXml: (str) => {
        if (!str) return '';
        return str.replace(/<!ENTITY/gi, '').replace(/<!DOCTYPE/gi, '');
    },

    cep(v) { return (v || '').replace(/\D/g, '').substring(0, 8); },
};

/* ─── Validation ─── */
function validateEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function validateCNPJ(v) { return (v || '').replace(/\D/g, '').length >= 11; }

/* ─── Toast system ─── */
function toast(title, msg = '', type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    // Use textContent where possible instead of innerHTML for untrusted data
    const iconEl = document.createElement('div');
    iconEl.className = 'toast-icon';
    iconEl.textContent = icons[type] || 'ℹ️';
    const msgEl = document.createElement('div');
    msgEl.className = 'toast-msg';
    const strong = document.createElement('strong');
    strong.textContent = title;
    msgEl.appendChild(strong);
    if (msg) {
        const span = document.createElement('span');
        span.textContent = msg;
        msgEl.appendChild(span);
    }
    el.appendChild(iconEl);
    el.appendChild(msgEl);
    container.appendChild(el);
    setTimeout(() => { el.classList.add('removing'); setTimeout(() => el.remove(), 300); }, type === 'error' ? 6000 : 3500);
}

/* ─── Modal helpers ─── */
function openModal(id) { const m = document.getElementById(id); if (m) { m.classList.add('open'); document.body.style.overflow = 'hidden'; } }
function closeModal(id) { const m = document.getElementById(id); if (m) { m.classList.remove('open'); document.body.style.overflow = ''; } }

document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) { e.target.classList.remove('open'); document.body.style.overflow = ''; }
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach(m => { m.classList.remove('open'); document.body.style.overflow = ''; });
});

/* ─── Badge/status renderers ─── */
function badgeTicketStatus(status) {
    const s = TICKET_STATUS[status] || { label: esc(status), badge: 'badge-gray', dot: '#8B949E' };
    return `<span class="badge ${s.badge}"><span class="status-dot" style="background:${s.dot}"></span>${s.label}</span>`;
}

function badgePriority(p) {
    const pr = PRIORITY[p] || { label: esc(p), badge: 'badge-gray' };
    return `<span class="badge ${pr.badge}">${pr.label}</span>`;
}

function badgeContractType(type) {
    const map = { basico: 'badge-gray', empresarial: 'badge-blue', premium: 'badge-orange', emergencial: 'badge-red', pmoc: 'badge-green' };
    const sla = (typeof SLA_CONFIG !== 'undefined' && SLA_CONFIG[type]) ? SLA_CONFIG[type] : { label: esc(type) };
    return `<span class="badge ${map[type] || 'badge-gray'}">${sla.label || type}</span>`;
}

/** Render circular avatar for a user */
function renderAvatar(userId, size = '34px', fontSize = '0.82rem') {
    const u = typeof userId === 'object' ? userId : db.find('users', userId);
    if (!u) return `<div class="avatar-sm" style="width:${size};height:${size};font-size:${fontSize}">?</div>`;

    if (u.photo) {
        return `<img src="${u.photo}" class="avatar-sm" style="width:${size};height:${size};object-fit:cover;border:none" title="${esc(u.name)}">`;
    }
    return `<div class="avatar-sm" style="width:${size};height:${size};font-size:${fontSize}" title="${esc(u.name)}">${u.name.charAt(0).toUpperCase()}</div>`;
}

function badgeClientStatus(status) {
    return status === 'ativo'
        ? `<span class="badge badge-green"><span class="status-dot" style="background:#2EA043"></span>Ativo</span>`
        : `<span class="badge badge-gray"><span class="status-dot" style="background:#484F58"></span>Inativo</span>`;
}

/* ─── SLA Bar renderer ─── */
function renderSLABar(ticket, type = 'resolution') {
    const sla = calcSLA(ticket, type);
    return `<div class="sla-bar-wrap">
    <div class="sla-label"><span>${esc(sla.label)}</span><span>${sla.pct}%</span></div>
    <div class="sla-bar"><div class="sla-fill ${sla.state}" style="width:${sla.pct}%"></div></div>
  </div>`;
}

/* ─── Sidebar initialization ─── */
function initSidebar() {
    // Mobile hamburger
    const hamburger = document.getElementById('hamburger');
    const sidebar = document.getElementById('sidebar');
    if (hamburger && sidebar) {
        hamburger.addEventListener('click', () => sidebar.classList.toggle('open'));
        document.addEventListener('click', e => {
            if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== hamburger) {
                sidebar.classList.remove('open');
            }
        });
    }

    // Active nav highlight
    const path = window.location.pathname.split('/').pop();
    document.querySelectorAll('.nav-item[href]').forEach(a => {
        const href = a.getAttribute('href').split('/').pop();
        if (href && path && path === href) a.classList.add('active');
    });

    // User card
    const session = auth.current();
    if (session) {
        const nameEl = document.getElementById('sidebarUserName');
        const roleEl = document.getElementById('sidebarUserRole');
        const avatarEl = document.getElementById('sidebarAvatar');
        const roleLabels = {
            admin: 'Administrador',
            superadmin: '👑 Super Admin',
            tecnico: 'Técnico',
            cliente: 'Cliente',
        };
        if (nameEl) nameEl.textContent = session.name;
        if (roleEl) roleEl.textContent = roleLabels[session.role] || session.role;

        if (avatarEl) {
            if (session.photo) {
                avatarEl.innerHTML = `<img src="${session.photo}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
                avatarEl.style.background = 'none';
                avatarEl.style.padding = '0';
            } else {
                avatarEl.textContent = session.name.charAt(0).toUpperCase();
            }
        }

        // Inject "Usuários" nav link dynamically for superadmin and admin
        if (session.role === 'superadmin' || session.role === 'admin') {
            const nav = document.querySelector('.sidebar-nav');
            if (nav && !document.getElementById('navUsers')) {
                // Add "Sistema" section before injecting
                const sectionLabel = document.createElement('div');
                sectionLabel.className = 'nav-section-label';
                sectionLabel.textContent = 'Sistema';

                const link = document.createElement('a');
                link.id = 'navUsers';
                link.className = 'nav-item';
                link.href = resolveUsersPath();
                link.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span>Usuários</span>`;

                // Mark active if we're on users.html
                if (window.location.pathname.endsWith('users.html')) link.classList.add('active');

                nav.appendChild(sectionLabel);
                nav.appendChild(link);
            }
        }

        // Hide 'Financeiro' link for technicians strictly on the 'Base de Conhecimento' page
        if (session.role === 'tecnico' && window.location.pathname.endsWith('knowledge.html')) {
            const finLink = document.querySelector('a[href="financeiro.html"]');
            if (finLink) finLink.remove();
        }
    }

    // Notification badge
    try {
        const unread = db.get('notifications').filter(n => !n.read).length;
        document.querySelectorAll('.notif-badge').forEach(el => {
            el.textContent = unread;
            el.style.display = unread > 0 ? '' : 'none';
        });
    } catch { /* no notifications collection */ }

    // Ticket badge logic for 'Meus Chamados'
    window.updateTicketBadge = function () {
        if (!session) return;
        try {
            const allTickets = db.get('tickets');
            let userTickets = 0;
            if (session.role === 'cliente') {
                userTickets = allTickets.filter(t =>
                    (session.clientId && t.clientId === session.clientId) ||
                    t.clientId === session.userId ||
                    t.userId === session.userId
                ).length;
            } else {
                userTickets = allTickets.filter(t => t.assignedTo === session.userId || t.userId === session.userId).length;
            }

            document.querySelectorAll('.nav-item').forEach(item => {
                const text = item.textContent || '';
                if (text.includes('Chamados')) {
                    let badge = item.querySelector('.nav-badge');
                    if (!badge) {
                        badge = document.createElement('span');
                        badge.className = 'nav-badge';
                        item.appendChild(badge);
                    }
                    badge.textContent = userTickets;
                    badge.style.display = userTickets > 0 ? 'inline-flex' : 'none';
                    if (badge.classList.contains('notif-badge')) {
                        badge.classList.remove('notif-badge');
                    }
                }
            });
        } catch (e) { }
    };

    window.updateTicketBadge();
}

/** Resolve relative path to users.html from any admin/* page */
function resolveUsersPath() {
    const depth = window.location.pathname.replace(/\\/g, '/').split('/').length - 2;
    // If already in admin folder, just 'users.html'; if at root, 'admin/users.html'
    const isInAdmin = window.location.pathname.includes('/admin/');
    return isInAdmin ? 'users.html' : 'admin/users.html';
}

/* ─── Debounce ─── */
function debounce(fn, ms = 300) {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ─── Generate ticket number ─── */
function nextTicketNum() {
    const tickets = db.get('tickets');
    const max = tickets.reduce((m, t) => Math.max(m, parseInt(t.num?.replace('#', '').trim() || 0)), 0);
    return '#' + String(max + 1).padStart(5, '0');
}

/* ─── CSAT stars renderer ─── */
function renderStars(rating, size = '1rem') {
    return Array.from({ length: 5 }, (_, i) =>
        `<span style="color:${i < rating ? '#F0AD00' : '#484F58'};font-size:${size}">★</span>`
    ).join('');
}

/* ─── CSV export ─── */
function exportCSV(rows, filename) {
    if (!rows || !rows.length) { toast('Sem dados', 'Nenhum registro para exportar.', 'warning'); return; }
    try {
        const header = Object.keys(rows[0]).join(',');
        const body = rows.map(r => Object.values(r).map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
    } catch (err) {
        toast('Erro na exportação', 'Não foi possível gerar o CSV.', 'error');
    }
}

/* ─── Dropdown toggles ─── */
document.addEventListener('click', e => {
    const trigger = e.target.closest('[data-dropdown]');
    document.querySelectorAll('.dropdown.open').forEach(d => { if (!d.contains(trigger)) d.classList.remove('open'); });
    if (trigger) { const dropdown = trigger.closest('.dropdown'); if (dropdown) dropdown.classList.toggle('open'); }
});

/* ─── PMOC Report (shared between dashboard and contracts) ─── */
async function baixarRelatorioPmoc(cId, btnEl) {
    const btn = btnEl || document.querySelector('[data-pmoc-btn]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Gerando…'; }
    try {
        const r = await fetch(`/api/pmoc/relatorio/${cId}`);
        const j = await r.json();
        if (!j.success) throw new Error(j.error || 'Erro desconhecido');
        const rel = j.data;

        const hoje = new Date().toLocaleDateString('pt-BR');
        const eqs = rel.equipamentos || [];
        const win = window.open('', '_blank');
        win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>Relatório PMOC — ${esc(rel.cliente || '')}</title><style>
          body{font-family:Inter,sans-serif;padding:40px;max-width:900px;margin:0 auto;color:#1a1a1a}
          h1{color:#00AEEF;font-size:1.4rem;margin-bottom:4px}
          h2{font-size:1.1rem;color:#333;margin-top:32px;border-bottom:2px solid #00AEEF;padding-bottom:8px}
          table{width:100%;border-collapse:collapse;margin-top:12px;font-size:.85rem}
          th{background:#00AEEF;color:#fff;padding:10px 12px;text-align:left}
          td{padding:10px 12px;border-bottom:1px solid #e0e0e0}
          tr:nth-child(even){background:#f9f9f9}
          .b-ok{background:#d4edda;color:#155724;padding:3px 10px;border-radius:50px;font-size:.75rem;font-weight:700;display:inline-block}
          .b-warn{background:#f8d7da;color:#721c24;padding:3px 10px;border-radius:50px;font-size:.75rem;font-weight:700;display:inline-block}
          .footer{margin-top:40px;padding:16px;background:#f0f0f0;border-radius:8px;font-size:.78rem;color:#555}
          @media print{.no-print{display:none}}
        </style></head><body>
          <h1>📋 Relatório PMOC — Plano de Manutenção, Operação e Controle</h1>
          <p><strong>Cliente:</strong> ${esc(rel.cliente || '–')} &nbsp;|&nbsp; <strong>Emitido:</strong> ${hoje} &nbsp;|&nbsp; <strong>Ref.:</strong> ABNT NBR 16020</p>
          <p><strong>Responsável Técnico:</strong> ${esc(rel.responsavelTecnico || '–')} &nbsp;|&nbsp; <strong>CREA:</strong> ${esc(rel.crea || '–')}</p>

          <h2>🏢 Equipamentos em Plano PMOC</h2>
          ${eqs.length ? `<table><thead><tr><th>Equipamento</th><th>Local</th><th>BTU/h</th><th>Histórico</th><th>Conformidade</th></tr></thead><tbody>
            ${eqs.map(({equipamento, manutencoes}) => {
              const nok = (manutencoes||[]).filter(m=>m.resultado==='NOK').length;
              return `<tr>
                <td><strong>${esc(equipamento.marca||'')} ${esc(equipamento.modelo||'')}</strong><br><span style="font-size:.75rem;color:#666">${esc(equipamento.numero_serie||'S/N')}</span></td>
                <td>${esc(equipamento.local_instalacao||'–')}</td>
                <td>${equipamento.potencia_btu ? Number(equipamento.potencia_btu).toLocaleString('pt-BR') : '–'}</td>
                <td>${(manutencoes||[]).map(m=>`<div style="font-size:.75rem;padding:2px 0">${esc(m.tipo_manutencao||'')} — ${m.ultima_data?new Date(m.ultima_data).toLocaleDateString('pt-BR'):'Pendente'}</div>`).join('')}</td>
                <td>${nok>0?'<span class="b-warn">Com ressalvas</span>':'<span class="b-ok">Conforme</span>'}</td>
              </tr>`;}).join('')}
          </tbody></table>` : '<p>Nenhum equipamento com PMOC obrigatório registrado para este cliente.</p>'}

          <div class="footer">
            <strong>Declaração de Conformidade:</strong> O presente relatório atesta que as manutenções preventivas descritas foram executadas conforme o Plano de Manutenção, Operação e Controle (PMOC) previsto na norma <strong>ABNT NBR 16020</strong>. O responsável técnico declara, sob as penas da lei, que as informações aqui contidas são verídicas e correspondem à realidade dos equipamentos instalados.
          </div>
          <br><button class="no-print" onclick="window.print()" style="padding:10px 20px;background:#00AEEF;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700">🖨️ Imprimir / Salvar PDF</button>
        </body></html>`);
        win.document.close();
        toast('Pronto!', 'Relatório aberto em nova janela. Use Ctrl+P para salvar como PDF.', 'success');
    } catch(e) {
        toast('Erro', e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '📥 Baixar Relatório PMOC'; }
    }
}
