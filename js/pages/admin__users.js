/* Extraido de admin/users.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('auth', function () { return typeof auth !== 'undefined' ? auth : undefined; }, function (v) { auth = v; });
  def('checkEditPwdMatch', function () { return typeof checkEditPwdMatch !== 'undefined' ? checkEditPwdMatch : undefined; }, function (v) { checkEditPwdMatch = v; });
  def('checkSetPwdMatch', function () { return typeof checkSetPwdMatch !== 'undefined' ? checkSetPwdMatch : undefined; }, function (v) { checkSetPwdMatch = v; });
  def('closeModal', function () { return typeof closeModal !== 'undefined' ? closeModal : undefined; }, function (v) { closeModal = v; });
  def('confirmDeactivate', function () { return typeof confirmDeactivate !== 'undefined' ? confirmDeactivate : undefined; }, function (v) { confirmDeactivate = v; });
  def('confirmSetPassword', function () { return typeof confirmSetPassword !== 'undefined' ? confirmSetPassword : undefined; }, function (v) { confirmSetPassword = v; });
  def('createUser', function () { return typeof createUser !== 'undefined' ? createUser : undefined; }, function (v) { createUser = v; });
  def('exportUsers', function () { return typeof exportUsers !== 'undefined' ? exportUsers : undefined; }, function (v) { exportUsers = v; });
  def('g', function () { return typeof g !== 'undefined' ? g : undefined; }, function (v) { g = v; });
  def('handlePhotoSelect', function () { return typeof handlePhotoSelect !== 'undefined' ? handlePhotoSelect : undefined; }, function (v) { handlePhotoSelect = v; });
  def('openEdit', function () { return typeof openEdit !== 'undefined' ? openEdit : undefined; }, function (v) { openEdit = v; });
  def('openModal', function () { return typeof openModal !== 'undefined' ? openModal : undefined; }, function (v) { openModal = v; });
  def('openSetPassword', function () { return typeof openSetPassword !== 'undefined' ? openSetPassword : undefined; }, function (v) { openSetPassword = v; });
  def('promptDeactivate', function () { return typeof promptDeactivate !== 'undefined' ? promptDeactivate : undefined; }, function (v) { promptDeactivate = v; });
  def('reactivate', function () { return typeof reactivate !== 'undefined' ? reactivate : undefined; }, function (v) { reactivate = v; });
  def('removePhoto', function () { return typeof removePhoto !== 'undefined' ? removePhoto : undefined; }, function (v) { removePhoto = v; });
  def('renderTable', function () { return typeof renderTable !== 'undefined' ? renderTable : undefined; }, function (v) { renderTable = v; });
  def('saveEditUser', function () { return typeof saveEditUser !== 'undefined' ? saveEditUser : undefined; }, function (v) { saveEditUser = v; });
  def('toggleClientField', function () { return typeof toggleClientField !== 'undefined' ? toggleClientField : undefined; }, function (v) { toggleClientField = v; });
})();
/* ── fim do bloco gerado ── */

        const session = auth.protect(['admin', 'superadmin']);
        if (!session) throw new Error('Access denied');

        document.addEventListener('DOMContentLoaded', () => {
            if (session.role !== 'superadmin') {
                const superBar = document.querySelector('.superadmin-bar');
                if (superBar) superBar.style.display = 'none';

                document.querySelectorAll('#newRole option[value="superadmin"], #editRole option[value="superadmin"], #filterRole option[value="superadmin"]').forEach(opt => opt.remove());
            }
        });

        initSidebar();

        let deactivatingId = null;

        /* ─── Role badge HTML ─── */
        function badgeRole(role) {
            const map = {
                superadmin: '<span class="badge role-badge-superadmin">👑 Super Admin</span>',
                admin: '<span class="badge badge-blue">Admin</span>',
                tecnico: '<span class="badge badge-orange">Técnico</span>',
                cliente: '<span class="badge badge-green">Cliente</span>',
            };
            return map[role] || `<span class="badge badge-gray">${role}</span>`;
        }

        /* ─── Photo Handling ─── */
        let currentPhotos = { new: null, edit: null };

        function handlePhotoSelect(event, type) {
            const file = event.target.files[0];
            if (!file) return;

            if (!file.type.startsWith('image/')) {
                toast('Erro de arquivo', 'Por favor, selecione uma imagem.', 'error');
                return;
            }

            if (file.size > 2 * 1024 * 1024) {
                toast('Arquivo muito grande', 'A imagem deve ter no máximo 2MB.', 'warning');
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const base64 = e.target.result;
                currentPhotos[type] = base64;
                document.getElementById(`${type}PhotoPreview`).src = base64;
                document.getElementById(`btnRemove${type.charAt(0).toUpperCase() + type.slice(1)}Photo`).style.display = 'flex';
            };
            reader.readAsDataURL(file);
        }

        function removePhoto(type) {
            currentPhotos[type] = null;
            document.getElementById(`${type}PhotoPreview`).src = '../assets/avatar-default.png';
            document.getElementById(`btnRemove${type.charAt(0).toUpperCase() + type.slice(1)}Photo`).style.display = 'none';
            document.getElementById(`${type}PhotoInput`).value = '';
        }

        /* ─── Render table ─── */
        function renderTable() {
            const search = document.getElementById('searchInput').value.toLowerCase();
            const roleF = document.getElementById('filterRole').value;
            const statusF = document.getElementById('filterStatus').value;

            let users = db.get('users').filter(u => {
                const matchSearch = !search || u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search);
                const matchRole = !roleF || u.role === roleF;
                const matchStatus = !statusF || (statusF === 'ativo' ? !u.deactivated : u.deactivated);
                return matchSearch && matchRole && matchStatus;
            });

            // Sort: superadmin first, then admin, tecnico, cliente
            const order = { superadmin: 0, admin: 1, tecnico: 2, cliente: 3 };
            users.sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9));

            const tbody = document.getElementById('usersBody');
            if (!users.length) {
                tbody.innerHTML = '<tr><td colspan="7" class="td-muted" style="text-align:center;padding:32px">Nenhum usuário encontrado.</td></tr>';
                return;
            }

            tbody.innerHTML = users.map(u => {
                const isSelf = u.id === session.userId;
                const statusBadge = u.deactivated
                    ? '<span class="badge badge-gray"><span class="status-dot" style="background:#484F58"></span>Inativo</span>'
                    : '<span class="badge badge-green"><span class="status-dot" style="background:#2EA043"></span>Ativo</span>';

                // Photo or Initial
                const avatarThumb = u.photo
                    ? `<img src="${u.photo}" class="avatar-sm" style="object-fit:cover">`
                    : `<div class="avatar-sm">${u.name.charAt(0).toUpperCase()}</div>`;

                const isTargetSuperAdmin = u.role === 'superadmin';
                const canEdit = session.role === 'superadmin' || !isTargetSuperAdmin;

                let actionsHtml = '';
                if (isSelf) {
                    actionsHtml = '<span class="lock-icon" title="Conta própria — use as configurações de perfil">🔒</span>';
                } else if (!canEdit) {
                    actionsHtml = '<span class="lock-icon" title="Apenas o Super Admin pode gerenciar este usuário">🔒</span>';
                } else {
                    actionsHtml = `<button class="btn btn-ghost btn-sm btn-icon" title="Editar dados" data-on-click="openEdit('${u.id}')">✏️</button>
                       <button class="btn btn-ghost btn-sm btn-icon" title="Definir senha" data-on-click="openSetPassword('${u.id}')">🔑</button>
                       ${!u.deactivated
                            ? `<button class="btn btn-danger btn-sm" title="Desativar" data-on-click="promptDeactivate('${u.id}','${u.name.replace(/'/g, "\\'")}')">Desativar</button>`
                            : `<button class="btn btn-success btn-sm" title="Reativar" data-on-click="reactivate('${u.id}')">Reativar</button>`
                        }`;
                }

                return `<tr class="${u.deactivated ? 'opacity:0.5' : ''}">
                    <td>
                        <div class="user-row-info">
                            ${avatarThumb}
                            <div>
                                <div style="font-weight:600;font-size:0.875rem">${esc(u.name)} ${isSelf ? '<span style="font-size:0.7rem;color:var(--text-muted)">(você)</span>' : ''}</div>
                                <div class="td-muted">${u.clientId ? 'ID: ' + esc(u.clientId) : ''}</div>
                            </div>
                        </div>
                    </td>
                    <td>${badgeRole(u.role)}</td>
                    <td class="td-muted">${esc(u.email)}</td>
                    <td style="text-align:center">${u.twofa ? '<span title="2FA ativo">🔐</span>' : '<span title="Sem 2FA" style="color:var(--text-muted)">—</span>'}</td>
                    <td>${statusBadge}</td>
                    <td class="td-muted">${fmt.date(u.createdAt)}</td>
                    <td>
                        <div class="td-actions">
                            ${actionsHtml}
                        </div>
                    </td>
                </tr>`;
            }).join('');
        }

        /* ─── Create User ─── */
        function toggleClientField() {
            const role = document.getElementById('newRole').value;
            const group = document.getElementById('clientFieldGroup');
            group.style.display = role === 'cliente' ? 'block' : 'none';
            if (role === 'cliente') {
                const sel = document.getElementById('newClientId');
                sel.innerHTML = '<option value="">— Selecione —</option>' +
                    db.get('clients').map(c => `<option value="${c.id}">${c.fantasia}</option>`).join('');
            }
        }

        function createUser() {
            const name = document.getElementById('newName').value.trim();
            const email = document.getElementById('newEmail').value.trim().toLowerCase();
            const pass = document.getElementById('newPassword').value;
            const role = document.getElementById('newRole').value;
            const twofa = document.getElementById('new2FA').checked;
            const clientId = document.getElementById('newClientId').value || null;
            const photo = currentPhotos.new;

            if (role === 'superadmin' && session.role !== 'superadmin') {
                return toast('Permissão Negada', 'Você não tem permissão para criar usuários do tipo superadmin', 'error');
            }
            if (!name || !email || !pass) return toast('Campo obrigatório', 'Preencha nome, e-mail e senha.', 'warning');
            if (!validateEmail(email)) return toast('E-mail inválido', '', 'warning');
            if (pass.length < 8) return toast('Senha fraca', 'Use ao menos 8 caracteres.', 'warning');
            if (db.get('users').find(u => u.email === email)) return toast('E-mail já cadastrado', email, 'error');

            db.insert('users', { name, email, password: pass, role, twofa, clientId, deactivated: false, photo });
            toast('Usuário criado!', name, 'success');
            closeModal('modalNewUser');

            // Reset fields
            document.getElementById('newName').value = '';
            document.getElementById('newEmail').value = '';
            document.getElementById('newPassword').value = '';
            removePhoto('new');

            renderTable();
        }

        /* ─── Edit User ─── */
        function openEdit(id) {
            const u = db.find('users', id);
            if (!u) return;
            document.getElementById('editUserId').value = id;
            document.getElementById('editName').value = u.name;
            document.getElementById('editEmail').value = u.email;
            document.getElementById('editPassword').value = '';
            document.getElementById('editRole').value = u.role;
            document.getElementById('edit2FA').checked = !!u.twofa;

            // Photo
            currentPhotos.edit = u.photo || null;
            document.getElementById('editPhotoPreview').src = u.photo || '../assets/avatar-default.png';
            document.getElementById('btnRemoveEditPhoto').style.display = u.photo ? 'flex' : 'none';

            openModal('modalEditUser');
        }

        function saveEditUser() {
            const id = document.getElementById('editUserId').value;
            const name = document.getElementById('editName').value.trim();
            const email = document.getElementById('editEmail').value.trim().toLowerCase();
            const pass = document.getElementById('editPassword').value;
            const passConfirm = document.getElementById('editPasswordConfirm').value;
            const role = document.getElementById('editRole').value;
            const twofa = document.getElementById('edit2FA').checked;
            const photo = currentPhotos.edit;

            if (role === 'superadmin' && session.role !== 'superadmin') {
                return toast('Permissão Negada', 'Você não tem permissão para conceder permissões de superadmin.', 'error');
            }
            const existingU = db.find('users', id);
            if (existingU && existingU.role === 'superadmin' && session.role !== 'superadmin') {
                return toast('Permissão Negada', 'Você não pode editar um Super Admin.', 'error');
            }

            if (!name || !email) return toast('Nome e e-mail são obrigatórios.', '', 'warning');
            if (!validateEmail(email)) return toast('E-mail inválido', '', 'warning');

            // Check email uniqueness (excluding self)
            const conflict = db.get('users').find(u => u.email === email && u.id !== id);
            if (conflict) return toast('E-mail já em uso', email, 'error');

            const updates = { name, email, role, twofa, photo };
            if (pass) {
                if (pass.length < 8) return toast('Senha muito curta', 'Mínimo 8 caracteres.', 'warning');
                if (pass !== passConfirm) return toast('Senhas não coincidem', 'Confirme a nova senha.', 'error');
                updates.password = pass;
            }

            db.update('users', id, updates);
            toast('Usuário atualizado!', name, 'success');
            closeModal('modalEditUser');
            renderTable();
        }

        /* ─── Quick Set Password ─── */
        function openSetPassword(id) {
            const u = db.find('users', id);
            if (!u) return;
            document.getElementById('setPwdUserId').value = id;
            document.getElementById('setPwdUserLabel').textContent = `Definindo nova senha para: ${u.name} (${u.email})`;
            document.getElementById('setPwdNew').value = '';
            document.getElementById('setPwdConfirm').value = '';
            document.getElementById('setPwdMatchMsg').textContent = '';
            document.getElementById('setPwdBtn').disabled = false;
            openModal('modalSetPassword');
        }

        function checkSetPwdMatch() {
            const p1 = document.getElementById('setPwdNew').value;
            const p2 = document.getElementById('setPwdConfirm').value;
            const msg = document.getElementById('setPwdMatchMsg');
            const btn = document.getElementById('setPwdBtn');
            if (!p2) { msg.textContent = ''; btn.disabled = false; return; }
            const ok = p1 === p2;
            msg.textContent = ok ? '✅ Senhas coincidem' : '❌ Senhas não coincidem';
            msg.style.color = ok ? '#2EA043' : '#DA3633';
            btn.disabled = !ok;
        }

        function checkEditPwdMatch() {
            const p1 = document.getElementById('editPassword').value;
            const group = document.getElementById('editConfirmGroup');
            group.style.display = p1 ? 'block' : 'none';
            if (!p1) return;
            const p2 = document.getElementById('editPasswordConfirm').value;
            const msg = document.getElementById('editPwdMatchMsg');
            if (!p2) { msg.textContent = ''; return; }
            const ok = p1 === p2;
            msg.textContent = ok ? '✅ Senhas coincidem' : '❌ Senhas não coincidem';
            msg.style.color = ok ? '#2EA043' : '#DA3633';
        }

        function confirmSetPassword() {
            const id = document.getElementById('setPwdUserId').value;
            const pass = document.getElementById('setPwdNew').value;
            const passConfirm = document.getElementById('setPwdConfirm').value;

            if (!pass) return toast('Informe a nova senha.', '', 'warning');
            if (pass.length < 8) return toast('Senha muito curta', 'Mínimo 8 caracteres.', 'warning');
            if (pass !== passConfirm) return toast('Senhas não coincidem', 'Confirme a nova senha.', 'error');

            const u = db.find('users', id);
            if (!u) return;
            db.update('users', id, { password: pass });
            toast('Senha atualizada!', u.name, 'success');
            closeModal('modalSetPassword');
            renderTable();
        }

        /* ─── Deactivate / Reactivate ─── */
        function promptDeactivate(id, name) {
            deactivatingId = id;
            document.getElementById('confirmDeleteText').textContent = `Desativar "${name}"? O usuário não poderá mais fazer login.`;
            openModal('modalConfirmDelete');
        }

        function confirmDeactivate() {
            if (!deactivatingId) return;
            db.update('users', deactivatingId, { deactivated: true });
            toast('Usuário desativado', '', 'warning');
            closeModal('modalConfirmDelete');
            deactivatingId = null;
            renderTable();
        }

        function reactivate(id) {
            db.update('users', id, { deactivated: false });
            toast('Usuário reativado!', '', 'success');
            renderTable();
        }

        /* ─── Export ─── */
        function exportUsers() {
            const rows = db.get('users').map(u => ({
                Nome: u.name,
                Email: u.email,
                Perfil: u.role,
                '2FA': u.twofa ? 'Sim' : 'Não',
                Status: u.deactivated ? 'Inativo' : 'Ativo',
                Criado: fmt.date(u.createdAt),
            }));
            exportCSV(rows, 'usuarios-renostter.csv');
        }

        /* Init */
        renderTable();
    
