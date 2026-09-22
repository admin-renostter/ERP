// js/login.js — extraido do <script> inline que existia em index.html.
//
// Motivo: a Content-Security-Policy do servidor (helmet, em server.js)
// define script-src 'self' https://cdn.jsdelivr.net, sem 'unsafe-inline'.
// Isso bloqueia SILENCIOSAMENTE tanto blocos <script> inline quanto
// atributos onclick="" / onkeydown="" / etc — por isso o botao "Entrar"
// (e os outros botoes desta pagina) nao faziam nada ao clicar.
//
// Fix: toda a logica mora aqui (arquivo externo, permitido por 'self'),
// e os cliques sao ligados via addEventListener em vez de onclick="".

// Redirect if already logged in (so conta como logado se tiver um
// accessToken real — ver SECURITY FIX em js/auth.js)
const existing = auth.current();
if (existing && existing.accessToken) redirectToDashboard(existing.role);

let selectedRole = 'admin';

function selectPortal(role, btn) {
  selectedRole = role;
  document.querySelectorAll('.portal-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const hints = { admin: 'admin@renostter.com', tecnico: 'tecnico@renostter.com', cliente: 'joao@techcorp.com' };
  document.getElementById('loginEmail').placeholder = hints[role];
}

function fillCreds(email, pass, role) {
  document.getElementById('loginEmail').value = email;
  document.getElementById('loginPassword').value = pass;
  // Select the right tab
  document.querySelectorAll('.portal-tab').forEach(b => {
    if (b.dataset.role === role) { selectPortal(role, b); b.classList.add('active'); }
    else b.classList.remove('active');
  });
  selectedRole = role;
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pass = document.getElementById('loginPassword').value.trim(); // trim to catch copy-paste spaces
  const errEl = document.getElementById('loginError');
  errEl.classList.remove('visible');

  if (!email || !pass) {
    errEl.textContent = 'Preencha e-mail e senha.';
    errEl.classList.add('visible');
    return;
  }

  const btn = document.getElementById('btnLogin');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = 'Entrando...';

  try {
    // SECURITY FIX (11/09): login real contra o backend (bcrypt + JWT
    // em cora-api/routes/auth.js), nao mais comparacao de senha em
    // texto puro contra o localStorage do proprio navegador — ver
    // js/auth.js para detalhes e o achado de seguranca original.
    const session = await auth.login(email, pass);
    redirectToDashboard(session.role);
  } catch (err) {
    const messages = {
      MISSING_CREDENTIALS: 'Preencha e-mail e senha.',
      TOO_MANY_ATTEMPTS: 'Muitas tentativas. Tente novamente em alguns minutos.',
      INVALID_CREDENTIALS: 'E-mail ou senha incorretos.',
      INVALID_2FA: 'Codigo de verificacao invalido.',
      NETWORK_ERROR: 'Nao foi possivel contatar o servidor. Verifique sua conexao.',
    };
    errEl.textContent = messages[err.code] || err.message || 'Nao foi possivel entrar. Tente novamente.';
    errEl.classList.add('visible');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

function toggleDemo() {
  const box = document.getElementById('demoCreds');
  const btn = document.getElementById('demoToggle');
  const visible = box.style.display !== 'none';
  box.style.display = visible ? 'none' : 'block';
  btn.textContent = visible ? '▼ Mostrar credenciais de demo' : '▲ Ocultar demo';
}

// ---- Ligacao dos eventos (antes feita via onclick="" inline no HTML,
// bloqueado pelo CSP) ----
document.querySelectorAll('.portal-tab').forEach(btn => {
  btn.addEventListener('click', () => selectPortal(btn.dataset.role, btn));
});

const loginPasswordEl = document.getElementById('loginPassword');
if (loginPasswordEl) {
  loginPasswordEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
}

const btnLoginEl = document.getElementById('btnLogin');
if (btnLoginEl) btnLoginEl.addEventListener('click', doLogin);

document.querySelectorAll('.copy-btn-demo').forEach(btn => {
  btn.addEventListener('click', () => fillCreds(btn.dataset.email, btn.dataset.pass, btn.dataset.role));
});

const demoToggleEl = document.getElementById('demoToggle');
if (demoToggleEl) demoToggleEl.addEventListener('click', toggleDemo);

// Etapa de 2FA: verify2FA()/back2FA() nao existem em nenhum arquivo do
// projeto (ja era assim antes desta correcao — recurso incompleto/nao
// finalizado). Mantido com guarda pra nao quebrar nada além do que já
// estava quebrado.
const twofaInputEl = document.getElementById('twofaInput');
if (twofaInputEl) {
  twofaInputEl.addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '');
  });
  twofaInputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && typeof verify2FA === 'function') verify2FA();
  });
}

const btnVerify2FAEl = document.getElementById('btnVerify2FA');
if (btnVerify2FAEl) btnVerify2FAEl.addEventListener('click', () => { if (typeof verify2FA === 'function') verify2FA(); });

const btnBack2FAEl = document.getElementById('btnBack2FA');
if (btnBack2FAEl) btnBack2FAEl.addEventListener('click', () => { if (typeof back2FA === 'function') back2FA(); });
