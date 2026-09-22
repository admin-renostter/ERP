/* Extraido de admin/tenants.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
// ════════════════════════════════════════════════════════════════
// ESTADO & AUTH
// ════════════════════════════════════════════════════════════════
const API_BASE = (() => {
  // Detecta se está rodando no mesmo host (porta 8080) ou em outro
  return ''; // mesma origem (/api/...)
})();
let authToken = localStorage.getItem('jwt') || '';
let currentUser = null;
let currentTenant = null;

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.code = data.code; err.status = res.status; err.data = data;
    throw err;
  }
  return data;
}

// ════════════════════════════════════════════════════════════════
// AUTH BOOT
// ════════════════════════════════════════════════════════════════
async function boot() {
  // Token legado (fallback dev) — o ideal é JWT
  if (!authToken) {
    const legacyUser = localStorage.getItem('user_data');
    if (legacyUser) {
      try { currentUser = JSON.parse(legacyUser); } catch (_) {}
    }
  }
  try {
    const me = await api('/api/auth/me');
    currentUser = me.user;
    document.getElementById('authBadge').textContent =
      `${currentUser.role || 'user'} · ${currentUser.name || ''}`;
    // Listar tenants do user como fallback
    if (!document.getElementById('tenantRows').dataset.loaded) {
      loadTenants();
    }
  } catch (e) {
    // Modo dev: usa headers legados via query ?userId=...
    if (e.status === 401) {
      document.getElementById('authBadge').textContent = 'Não autenticado';
      showToast('Faça login para acessar. Em dev, ?token=JWT funciona.', 'error');
    }
  }
}

// ════════════════════════════════════════════════════════════════
// LISTAGEM
// ════════════════════════════════════════════════════════════════
async function loadTenants() {
  const rows = document.getElementById('tenantRows');
  rows.innerHTML = '<div class="loading">Carregando tenants...</div>';
  const status = document.getElementById('filterStatus').value;
  const plano = document.getElementById('filterPlano').value;
  const search = document.getElementById('searchInput').value.trim();
  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  if (plano) qs.set('plano', plano);
  if (search) qs.set('search', search);

  try {
    const data = await api(`/api/tenants?${qs.toString()}`);
    rows.dataset.loaded = '1';
    if (!data.data || data.data.length === 0) {
      rows.innerHTML = '<div class="empty">Nenhum tenant encontrado.</div>';
      return;
    }
    rows.innerHTML = '';
    for (const t of data.data) {
      const created = t.created_at ? new Date(t.created_at).toLocaleDateString('pt-BR') : '—';
      const usersCount = t.total_usuarios || 0;
      const row = document.createElement('div');
      row.className = 'tenant-row';
      row.innerHTML = `
        <div>
          <div class="name">${escapeHtml(t.nome)}</div>
          <div class="slug">${escapeHtml(t.slug)}${t.documento ? ' · ' + escapeHtml(t.documento) : ''}</div>
        </div>
        <div><span class="plano-tag plano-${t.plano}">${t.plano}</span></div>
        <div><span class="status-tag status-${t.status}">${t.status}</span></div>
        <div>${usersCount}</div>
        <div style="font-size: .85rem; color: var(--text-secondary);">${created}</div>
        <div><button class="btn btn-sm btn-secondary" data-id="${t.id}">Ver</button></div>
      `;
      row.querySelector('button').addEventListener('click', (e) => {
        e.stopPropagation();
        openDrawer(t.id);
      });
      row.addEventListener('click', () => openDrawer(t.id));
      rows.appendChild(row);
    }
  } catch (e) {
    rows.innerHTML = `<div class="empty">Erro ao carregar: ${escapeHtml(e.message)}<br/><small>Verifique se você tem permissão de superadmin.</small></div>`;
  }
}

// Filtros (debounce)
let searchDebounce = null;
document.getElementById('searchInput').addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(loadTenants, 300);
});
document.getElementById('filterStatus').addEventListener('change', loadTenants);
document.getElementById('filterPlano').addEventListener('change', loadTenants);

// ════════════════════════════════════════════════════════════════
// DRAWER
// ════════════════════════════════════════════════════════════════
async function openDrawer(tenantId) {
  const drawer = document.getElementById('tenantDrawer');
  drawer.classList.add('active');
  document.getElementById('drawerTitle').textContent = 'Carregando...';
  try {
    const t = await api(`/api/tenants/${tenantId}`);
    currentTenant = t.data;
    document.getElementById('drawerTitle').innerHTML = `
      ${escapeHtml(currentTenant.nome)}
      <span class="plano-tag plano-${currentTenant.plano}" style="margin-left: 8px; font-size: .65rem;">${currentTenant.plano}</span>
      <span class="status-tag status-${currentTenant.status}" style="margin-left: 4px; font-size: .65rem;">${currentTenant.status}</span>
    `;
    renderOverview();
    loadUsers();
    loadInvites();
    fillSettings();
    // Mostrar/esconder botões de admin
    const isDefault = currentTenant.id === 'tnt_default';
    document.getElementById('btnCancelTenant').style.display = isDefault ? 'none' : (currentTenant.status === 'ativo' ? '' : 'none');
    document.getElementById('btnCancelTenantForce').style.display = isDefault ? 'none' : (currentTenant.status === 'cancelado' ? 'none' : '');
    document.getElementById('btnReactivateTenant').style.display = (currentTenant.status === 'suspenso' || currentTenant.status === 'cancelado') ? '' : 'none';
  } catch (e) {
    document.getElementById('drawerTitle').textContent = 'Erro: ' + e.message;
  }
}

function closeDrawer() {
  document.getElementById('tenantDrawer').classList.remove('active');
  currentTenant = null;
}
document.getElementById('btnCloseDrawer').addEventListener('click', closeDrawer);

// Tabs
document.querySelectorAll('.tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ════════════════════════════════════════════════════════════════
// OVERVIEW
// ════════════════════════════════════════════════════════════════
async function renderOverview() {
  const el = document.getElementById('overviewContent');
  el.innerHTML = '<div class="loading">Carregando...</div>';
  try {
    const stats = await api(`/api/tenants/${currentTenant.id}/stats`);
    const expira = stats.data.tenant.data_expiracao
      ? new Date(stats.data.tenant.data_expiracao).toLocaleDateString('pt-BR')
      : '—';
    el.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card">
          <div class="label">Usuários Ativos</div>
          <div class="value">${stats.data.usuarios.ativos} / ${stats.data.usuarios.limite}</div>
        </div>
        <div class="stat-card">
          <div class="label">Plano</div>
          <div class="value" style="font-size: 1rem;">${stats.data.tenant.plano}</div>
        </div>
        <div class="stat-card">
          <div class="label">Status</div>
          <div class="value" style="font-size: 1rem;">${stats.data.tenant.status}</div>
        </div>
        <div class="stat-card">
          <div class="label">Expira em</div>
          <div class="value" style="font-size: 1rem;">${expira}</div>
        </div>
      </div>
      <div class="info-grid">
        <div class="label">ID:</div>           <div class="value">${escapeHtml(currentTenant.id)}</div>
        <div class="label">Slug:</div>         <div class="value" style="font-family: monospace;">${escapeHtml(currentTenant.slug)}</div>
        <div class="label">Nome:</div>         <div class="value">${escapeHtml(currentTenant.nome)}</div>
        <div class="label">Email:</div>        <div class="value">${escapeHtml(currentTenant.email || '—')}</div>
        <div class="label">Telefone:</div>     <div class="value">${escapeHtml(currentTenant.telefone || '—')}</div>
        <div class="label">CNPJ/CPF:</div>     <div class="value">${escapeHtml(currentTenant.documento || '—')}</div>
        <div class="label">Criado em:</div>    <div class="value">${new Date(currentTenant.created_at).toLocaleString('pt-BR')}</div>
      </div>
    `;
  } catch (e) {
    el.innerHTML = `<div class="empty">Erro: ${escapeHtml(e.message)}</div>`;
  }
}

// ════════════════════════════════════════════════════════════════
// USERS
// ════════════════════════════════════════════════════════════════
async function loadUsers() {
  const list = document.getElementById('userList');
  list.innerHTML = '<div class="loading">Carregando usuários...</div>';
  try {
    const data = await api(`/api/tenants/${currentTenant.id}/users`);
    if (!data.data || data.data.length === 0) {
      list.innerHTML = '<div class="empty">Nenhum usuário vinculado.</div>';
      return;
    }
    list.innerHTML = '';
    for (const u of data.data) {
      const row = document.createElement('div');
      row.className = 'user-row';
      const ativoClass = u.ativo ? '' : 'opacity: .5;';
      row.style.cssText = ativoClass;
      row.innerHTML = `
        <div class="info">
          <div class="name">${escapeHtml(u.nome || u.username || '—')}</div>
          <div class="email">${escapeHtml(u.email || '')}</div>
        </div>
        <div><span class="role-tag role-${u.role}">${u.role}</span></div>
        <div class="actions">
          <button class="btn btn-sm btn-secondary" data-action="role" data-user="${u.usuario_id}">Alterar Role</button>
          <button class="btn btn-sm btn-danger" data-action="remove" data-user="${u.usuario_id}">Remover</button>
        </div>
      `;
      row.querySelector('[data-action="role"]').addEventListener('click', () => changeUserRole(u));
      row.querySelector('[data-action="remove"]').addEventListener('click', () => removeUser(u));
      list.appendChild(row);
    }
  } catch (e) {
    list.innerHTML = `<div class="empty">Erro: ${escapeHtml(e.message)}</div>`;
  }
}

async function changeUserRole(user) {
  const newRole = prompt(`Nova role para ${user.nome || user.email || user.usuario_id}:\n(owner | admin | user | viewer)`, user.role);
  if (!newRole || !['owner','admin','user','viewer'].includes(newRole)) return;
  try {
    await api(`/api/tenants/${currentTenant.id}/users/${user.usuario_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ role: newRole }),
    });
    showToast(`Role atualizada para ${newRole}`);
    loadUsers();
  } catch (e) { showToast(e.message, 'error'); }
}

async function removeUser(user) {
  if (!confirm(`Remover ${user.nome || user.email} do tenant?`)) return;
  try {
    await api(`/api/tenants/${currentTenant.id}/users/${user.usuario_id}`, { method: 'DELETE' });
    showToast('Usuário removido');
    loadUsers();
    renderOverview();
  } catch (e) { showToast(e.message, 'error'); }
}

// Add user
document.getElementById('btnAddUser').addEventListener('click', () => {
  document.getElementById('addUserId').value = '';
  document.getElementById('addUserRole').value = 'user';
  document.getElementById('addUserModal').classList.add('active');
});
document.getElementById('btnCancelAddUser').addEventListener('click', () => {
  document.getElementById('addUserModal').classList.remove('active');
});
document.getElementById('btnConfirmAddUser').addEventListener('click', async () => {
  const userId = document.getElementById('addUserId').value.trim();
  const role = document.getElementById('addUserRole').value;
  if (!userId) { showToast('Informe o User ID', 'error'); return; }
  try {
    await api(`/api/tenants/${currentTenant.id}/users`, {
      method: 'POST',
      body: JSON.stringify({ userId, role }),
    });
    showToast('Usuário adicionado');
    document.getElementById('addUserModal').classList.remove('active');
    loadUsers();
    renderOverview();
  } catch (e) { showToast(e.message, 'error'); }
});

// ════════════════════════════════════════════════════════════════
// INVITES
// ════════════════════════════════════════════════════════════════
async function loadInvites() {
  const list = document.getElementById('inviteList');
  list.innerHTML = '<div class="loading">Carregando convites...</div>';
  try {
    const data = await api(`/api/tenants/${currentTenant.id}/invites`);
    if (!data.data || data.data.length === 0) {
      list.innerHTML = '<div class="empty">Nenhum convite pendente.</div>';
      return;
    }
    list.innerHTML = '';
    for (const inv of data.data) {
      const expira = new Date(inv.expira_em);
      const expiraStr = expira.toLocaleString('pt-BR');
      const expirado = expira < new Date();
      const row = document.createElement('div');
      row.className = 'invite-row';
      row.style.cssText = expirado ? 'opacity: .5;' : '';
      row.innerHTML = `
        <div>
          <div>${escapeHtml(inv.email)}</div>
          <div class="invite-link">Token: ${escapeHtml(inv.token.substring(0, 16))}...</div>
        </div>
        <div><span class="role-tag role-${inv.role}">${inv.role}</span></div>
        <div style="font-size: .8rem; color: var(--text-muted);">${expirado ? '❌ Expirado' : '⏰'} ${expiraStr}</div>
        <div><button class="btn btn-sm btn-secondary" data-token="${inv.token}">📋 Copiar Link</button></div>
      `;
      row.querySelector('button').addEventListener('click', () => copyInviteLink(inv));
      list.appendChild(row);
    }
  } catch (e) {
    list.innerHTML = `<div class="empty">Erro: ${escapeHtml(e.message)}</div>`;
  }
}

function copyInviteLink(invite) {
  const link = `${window.location.origin}${API_BASE}/api/tenants/accept-invite?token=${invite.token}`;
  navigator.clipboard.writeText(link).then(() => {
    showToast('Link copiado! Compartilhe com o convidado.');
  }).catch(() => {
    prompt('Copie o link:', link);
  });
}

document.getElementById('btnNewInvite').addEventListener('click', () => {
  document.getElementById('inviteEmail').value = '';
  document.getElementById('inviteRole').value = 'user';
  document.getElementById('inviteTTL').value = '72';
  document.getElementById('inviteModal').classList.add('active');
});
document.getElementById('btnCancelInvite').addEventListener('click', () => {
  document.getElementById('inviteModal').classList.remove('active');
});
document.getElementById('btnConfirmInvite').addEventListener('click', async () => {
  const email = document.getElementById('inviteEmail').value.trim();
  const role = document.getElementById('inviteRole').value;
  const ttlHours = parseInt(document.getElementById('inviteTTL').value) || 72;
  if (!email) { showToast('Informe o email', 'error'); return; }
  try {
    const r = await api(`/api/tenants/${currentTenant.id}/invites`, {
      method: 'POST',
      body: JSON.stringify({ email, role, ttlHours }),
    });
    showToast('Convite criado! Token: ' + r.data.token.substring(0, 16) + '...');
    document.getElementById('inviteModal').classList.remove('active');
    loadInvites();
  } catch (e) { showToast(e.message, 'error'); }
});

// ════════════════════════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════════════════════════
function fillSettings() {
  document.getElementById('editNome').value = currentTenant.nome || '';
  document.getElementById('editEmail').value = currentTenant.email || '';
  document.getElementById('editTelefone').value = currentTenant.telefone || '';
  document.getElementById('editDocumento').value = currentTenant.documento || '';
}

document.getElementById('btnSaveSettings').addEventListener('click', async () => {
  try {
    const data = await api(`/api/tenants/${currentTenant.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        nome: document.getElementById('editNome').value,
        email: document.getElementById('editEmail').value,
        telefone: document.getElementById('editTelefone').value,
        documento: document.getElementById('editDocumento').value,
      }),
    });
    showToast('Configurações salvas');
    currentTenant = data.data;
    openDrawer(currentTenant.id);
  } catch (e) { showToast(e.message, 'error'); }
});

document.getElementById('btnCancelTenant').addEventListener('click', async () => {
  if (!confirm('Suspender este tenant? Usários não conseguirão acessar.')) return;
  try {
    await api(`/api/tenants/${currentTenant.id}/suspend`, { method: 'POST' });
    showToast('Tenant suspenso');
    openDrawer(currentTenant.id);
    loadTenants();
  } catch (e) { showToast(e.message, 'error'); }
});

document.getElementById('btnReactivateTenant').addEventListener('click', async () => {
  try {
    await api(`/api/tenants/${currentTenant.id}/reactivate`, { method: 'POST' });
    showToast('Tenant reativado');
    openDrawer(currentTenant.id);
    loadTenants();
  } catch (e) { showToast(e.message, 'error'); }
});

document.getElementById('btnCancelTenantForce').addEventListener('click', async () => {
  if (!confirm('CANCELAR tenant? Esta ação é definitiva (soft delete).')) return;
  try {
    await api(`/api/tenants/${currentTenant.id}/cancel`, { method: 'POST' });
    showToast('Tenant cancelado');
    openDrawer(currentTenant.id);
    loadTenants();
  } catch (e) { showToast(e.message, 'error'); }
});

// ════════════════════════════════════════════════════════════════
// NEW TENANT
// ════════════════════════════════════════════════════════════════
document.getElementById('btnNewTenant').addEventListener('click', () => {
  document.getElementById('newSlug').value = '';
  document.getElementById('newNome').value = '';
  document.getElementById('newDocumento').value = '';
  document.getElementById('newEmail').value = '';
  document.getElementById('newTelefone').value = '';
  document.getElementById('newPlano').value = 'trial';
  document.getElementById('newLimiteUsuarios').value = '5';
  document.getElementById('newLimiteContratos').value = '50';
  document.getElementById('newTenantModal').classList.add('active');
});
document.getElementById('btnCancelNew').addEventListener('click', () => {
  document.getElementById('newTenantModal').classList.remove('active');
});
document.getElementById('btnCreateTenant').addEventListener('click', async () => {
  const slug = document.getElementById('newSlug').value.trim().toLowerCase();
  const nome = document.getElementById('newNome').value.trim();
  if (!slug || !nome) { showToast('Slug e nome são obrigatórios', 'error'); return; }
  try {
    await api('/api/tenants', {
      method: 'POST',
      body: JSON.stringify({
        slug,
        nome,
        documento: document.getElementById('newDocumento').value.trim(),
        email: document.getElementById('newEmail').value.trim(),
        telefone: document.getElementById('newTelefone').value.trim(),
        plano: document.getElementById('newPlano').value,
        limite_usuarios: parseInt(document.getElementById('newLimiteUsuarios').value) || 5,
        limite_contratos: parseInt(document.getElementById('newLimiteContratos').value) || 50,
        ownerUserId: currentUser?.id, // atual user vira owner
      }),
    });
    showToast('Tenant criado!');
    document.getElementById('newTenantModal').classList.remove('active');
    loadTenants();
  } catch (e) { showToast(e.message, 'error'); }
});

// ════════════════════════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════════════════════════
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

boot();
