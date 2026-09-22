/* Extraido de forgot-password.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('D', function () { return typeof D !== 'undefined' ? D : undefined; }, function (v) { D = v; });
  def('changePassword', function () { return typeof changePassword !== 'undefined' ? changePassword : undefined; }, function (v) { changePassword = v; });
  def('checkStrength', function () { return typeof checkStrength !== 'undefined' ? checkStrength : undefined; }, function (v) { checkStrength = v; });
  def('g', function () { return typeof g !== 'undefined' ? g : undefined; }, function (v) { g = v; });
  def('goLogin', function () { return typeof goLogin !== 'undefined' ? goLogin : undefined; }, function (v) { goLogin = v; });
  def('requestCode', function () { return typeof requestCode !== 'undefined' ? requestCode : undefined; }, function (v) { requestCode = v; });
  def('showStep', function () { return typeof showStep !== 'undefined' ? showStep : undefined; }, function (v) { showStep = v; });
  def('verifyCode', function () { return typeof verifyCode !== 'undefined' ? verifyCode : undefined; }, function (v) { verifyCode = v; });
})();
/* ── fim do bloco gerado ── */

        // ─── CONFIG ─────────────────────────────────────────────────────────
        // Após o deploy do Worker, cole a URL aqui:
        // Ex: https://renostter-crm-reset.SEU_USUARIO.workers.dev
        const RESET_WORKER_URL = 'https://renostter-crm-reset.SEU_USUARIO.workers.dev';
        // ────────────────────────────────────────────────────────────────────

        const existing = auth.current();
        if (existing) redirectToDashboard(existing.role);

        let resetEmailGlobal = '';
        let resetTokenGlobal = '';
        let resetCodeGlobal = '';   // apenas local após verificação com sucesso
        let resetExpiresGlobal = 0;

        /* ─── Navegação entre steps ─── */
        function showStep(n) {
            [1, 2, 3, 4].forEach(i => {
                document.getElementById('step' + i).style.display = i === n ? 'block' : 'none';
            });
            [1, 2, 3].forEach(i => {
                const dot = document.getElementById('dot' + i);
                dot.classList.remove('active', 'done');
                if (i < n) { dot.classList.add('done'); dot.textContent = '✓'; }
                else if (i === n) { dot.classList.add('active'); dot.textContent = String(i); }
                else dot.textContent = String(i);
            });
        }

        function setLoading(btnId, loading, label) {
            const btn = document.getElementById(btnId);
            if (!btn) return;
            btn.disabled = loading;
            btn.innerHTML = loading
                ? `<span class="sending-spinner"></span>${label || 'Aguarde...'}`
                : btn.dataset.originalLabel || label;
            if (!loading && label) btn.dataset.originalLabel = label;
        }

        /* ─── STEP 1: Solicitar código ─── */
        async function requestCode(emailOverride, isResend = false) {
            const email = (emailOverride || document.getElementById('resetEmail').value).trim().toLowerCase();
            const errEl = document.getElementById('err1');
            errEl.classList.remove('visible');

            if (!email || !email.includes('@')) {
                errEl.textContent = 'Insira um e-mail válido.';
                errEl.classList.add('visible');
                return;
            }

            // Verificar se Worker está configurado
            if (RESET_WORKER_URL.includes('SEU_USUARIO')) {
                // Modo de desenvolvimento: mostrar aviso e simular envio
                console.warn('[RCRM] Worker URL não configurada. Usando modo de simulação.');
                useFallback(email);
                return;
            }

            setLoading('btnRequest', true, 'Enviando...');

            try {
                const res = await fetch(RESET_WORKER_URL + '/request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email }),
                });

                const data = await res.json();

                if (!res.ok || !data.ok) {
                    throw new Error(data.error || 'Erro ao enviar e-mail');
                }

                // Worker retornou token HMAC (código ficou APENAS no e-mail)
                resetEmailGlobal = email;
                resetTokenGlobal = data.token;
                resetExpiresGlobal = data.expires;

                document.getElementById('sentEmailLabel').textContent = email;
                showStep(2);
                setTimeout(() => document.getElementById('resetCode')?.focus(), 150);
                toast(isResend ? 'Código reenviado' : 'E-mail enviado', 'Verifique sua caixa de entrada.', 'success');

            } catch (err) {
                errEl.textContent = err.message || 'Falha ao enviar. Tente novamente.';
                errEl.classList.add('visible');
            } finally {
                setLoading('btnRequest', false, 'Enviar Código');
            }
        }

        /* Fallback para desenvolvimento (Worker não configurado) */
        function useFallback(email) {
            const code = passwordReset.request(email);
            resetEmailGlobal = email;
            resetTokenGlobal = '__dev__';
            document.getElementById('sentEmailLabel').textContent = email;

            // Mostrar código na tela apenas em dev
            const devBox = document.createElement('div');
            devBox.className = 'info-box';
            devBox.style.marginTop = '12px';
            devBox.innerHTML = `⚠️ <strong>Modo desenvolvimento</strong> — Configure o Worker para email real.<br>Código: <strong style="font-family:monospace;font-size:1.1rem;color:var(--blue)">${code || 'E-mail não encontrado'}</strong>`;
            document.getElementById('step2').insertBefore(devBox, document.getElementById('step2').firstChild);

            showStep(2);
            setTimeout(() => document.getElementById('resetCode')?.focus(), 150);
        }

        /* ─── STEP 2: Verificar código ─── */
        async function verifyCode() {
            const code = document.getElementById('resetCode').value.trim();
            const errEl = document.getElementById('err2');
            errEl.classList.remove('visible');

            if (code.length !== 6) {
                errEl.textContent = 'Digite o código de 6 dígitos.';
                errEl.classList.add('visible');
                return;
            }

            // Verificar expiração local (otimização: evita chamada ao Worker)
            if (resetExpiresGlobal && Date.now() > resetExpiresGlobal) {
                errEl.textContent = 'Código expirado. Solicite um novo.';
                errEl.classList.add('visible');
                return;
            }

            // Modo de desenvolvimento: verificar localmente
            if (resetTokenGlobal === '__dev__') {
                if (!passwordReset.verify(resetEmailGlobal, code)) {
                    errEl.textContent = 'Código inválido.';
                    errEl.classList.add('visible');
                    return;
                }
                resetCodeGlobal = code;
                showStep(3);
                setTimeout(() => document.getElementById('newPass')?.focus(), 150);
                return;
            }

            // Worker: verificar via API
            setLoading('btnVerify', true, 'Verificando...');

            try {
                const res = await fetch(RESET_WORKER_URL + '/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: resetEmailGlobal, code, token: resetTokenGlobal }),
                });
                const data = await res.json();

                if (!data.ok || !data.valid) {
                    errEl.textContent = 'Código inválido ou expirado. Tente novamente.';
                    errEl.classList.add('visible');
                    return;
                }

                resetCodeGlobal = code;
                showStep(3);
                setTimeout(() => document.getElementById('newPass')?.focus(), 150);

            } catch {
                errEl.textContent = 'Falha na verificação. Verifique sua conexão.';
                errEl.classList.add('visible');
            } finally {
                setLoading('btnVerify', false, 'Verificar Código');
            }
        }

        /* ─── Medidor de força ─── */
        function checkStrength(pass) {
            const fill = document.getElementById('strengthFill');
            const label = document.getElementById('strengthLabel');
            let score = 0;
            if (pass.length >= 8) score++;
            if (pass.length >= 12) score++;
            if (/[A-Z]/.test(pass)) score++;
            if (/[0-9]/.test(pass)) score++;
            if (/[^A-Za-z0-9]/.test(pass)) score++;
            const levels = [
                { pct: 0, color: '', text: '' },
                { pct: 20, color: '#DA3633', text: 'Muito fraca' },
                { pct: 40, color: '#D29922', text: 'Fraca' },
                { pct: 60, color: '#D29922', text: 'Razoável' },
                { pct: 80, color: '#2EA043', text: 'Boa' },
                { pct: 100, color: '#00AEEF', text: 'Excelente!' },
            ];
            const l = levels[score] || levels[0];
            fill.style.width = l.pct + '%';
            fill.style.background = l.color;
            label.textContent = l.text;
            label.style.color = l.color;
        }

        /* ─── STEP 3: Trocar senha ─── */
        function changePassword() {
            const newPass = document.getElementById('newPass').value;
            const confirm = document.getElementById('confirmPass').value;
            const errEl = document.getElementById('err3');
            errEl.classList.remove('visible');

            if (newPass.length < 8) {
                errEl.textContent = 'A senha deve ter pelo menos 8 caracteres.';
                errEl.classList.add('visible');
                return;
            }
            if (newPass !== confirm) {
                errEl.textContent = 'As senhas não coincidem.';
                errEl.classList.add('visible');
                return;
            }

            // Atualizar senha no localStorage
            const ok = passwordReset.changePassword(resetEmailGlobal, resetCodeGlobal, newPass);
            if (!ok && resetTokenGlobal !== '__dev__') {
                // Worker confirmou o código — podemos forçar atualização direto
                const users = db.get('users');
                const idx = users.findIndex(u => u.email === resetEmailGlobal);
                if (idx !== -1) {
                    users[idx].password = newPass;
                    users[idx].updatedAt = new Date().toISOString();
                    db.set('users', users);
                }
            }

            showStep(4);
            toast('Senha atualizada!', 'Faça login com a nova senha.', 'success');
        }

        function goLogin() { window.location.href = 'index.html'; }
    
