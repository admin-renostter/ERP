#!/bin/bash
# tools/build-frontend-fixes.sh — aplica, a partir do HEAD, todas as correcoes do
# frontend (encoding, URLs fixas de localhost, bugs pontuais, token nas chamadas
# /api e migracao para CSP sem 'unsafe-inline'). Reprodutivel: rodar de novo
# gera exatamente o mesmo resultado.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
git checkout -q HEAD -- '*.html' js/proposals.js js/utils.js js/login.js js/approval-banner.js js/approval-flow.js js/cora_integration.js
rm -rf js/pages
python3 tools/fix-encoding.py . 
python3 - <<'PY'
import re
# 1) popup do relatorio PMOC: janela nova herda a CSP, onclick nao funciona la
p='js/utils.js'; s=open(p,encoding='utf-8').read()
old='<br><button class="no-print" onclick="window.print()" style='
assert s.count(old)==1; s=s.replace(old,'<br><button class="no-print" id="btnPrintPmoc" style=')
old2="        win.document.close();\n        toast('Pronto!'"
assert s.count(old2)==1
s=s.replace(old2,"        win.document.close();\n        // A janela nova herda a CSP da pagina, entao onclick=\"\" nao funcionaria nela.\n        const btnPrint = win.document.getElementById('btnPrintPmoc');\n        if (btnPrint) btnPrint.addEventListener('click', () => win.print());\n        toast('Pronto!'")
open(p,'w',encoding='utf-8').write(s)
# 2) garantia.html: funcao local "api" colidia com "const api" de js/api.js
#    (SyntaxError: Identifier 'api' has already been declared) -> pagina inteira sem JS
p='admin/garantia.html'; s=open(p,encoding='utf-8').read()
n1=s.count('async function api('); assert n1==1
s=s.replace('async function api(','async function garantiaApi(')
s,n2=re.subn(r'(?<![\w.$])api\(',"garantiaApi(",s)
open(p,'w',encoding='utf-8').write(s); print('garantia: api() renomeada em',n2,'chamadas')
# 3) URLs fixas "http://localhost:3000" / "http://127.0.0.1:3000": em producao o
#    navegador tentava chamar a API no computador do proprio usuario. A API esta
#    na mesma origem do site (/api/...), entao a base correta e vazia.
fixes = [
  ('admin/aprovacoes.html', "const API = 'http://localhost:3000';", "const API = ''; // mesma origem (/api/...)", 1),
  ('admin/bancos.html', "const API_URL = 'http://localhost:3000';", "const API_URL = ''; // mesma origem (/api/...)", 1),
  ('admin/cobrancas.html', "const CORA_API = 'http://127.0.0.1:3000';", "const CORA_API = ''; // mesma origem (/api/...)", 1),
  ('admin/garantia.html', "const API = 'http://localhost:3000';", "const API = ''; // mesma origem (/api/...)", 1),
  ('admin/gateway-config.html', "fetch('http://localhost:3000/api/", "fetch('/api/", 6),
  ('admin/tenants.html', "return `${window.location.protocol}//${window.location.hostname}:3000`;", "return ''; // mesma origem (/api/...)", 1),
  ('js/approval-banner.js', "const API = (typeof CORA_API_URL === 'string') ? CORA_API_URL : 'http://localhost:3000';", "const API = (typeof CORA_API_URL === 'string') ? CORA_API_URL : '';", 1),
  ('js/approval-flow.js', "return isLocal ? 'http://localhost:3000' : '';", "return ''; // mesma origem (/api/...)", 1),
  ('js/cora_integration.js', "const API_HOST = '127.0.0.1';\nconst CORA_API_URL = `http://${API_HOST}:3000`;", "const CORA_API_URL = ''; // mesma origem (/api/...)", 1),
  # 4) client/dashboard: wrapper chamava a si mesmo (estouro de pilha) -> botao do relatorio PMOC nunca funcionava
  ('client/dashboard.html', "        window.baixarRelatorioPmoc = () => baixarRelatorioPmoc(clientId);\n", "", 1),
]
for f, old, new, n in fixes:
    s = open(f, encoding='utf-8').read()
    c = s.count(old)
    assert c == n, (f, old, c)
    open(f, 'w', encoding='utf-8').write(s.replace(old, new))
    print('ok', f, c)
# approval-banner: montava https://host:/api... ; usa a mesma origem
f='js/approval-banner.js'; s=open(f,encoding='utf-8').read()
old = """            const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
            return `${isLocal ? 'http' : 'https'}://${window.location.hostname}:${isLocal ? '3000' : ''}${path}`;"""
assert s.count(old)==1, 'banner'
s=s.replace(old, "            return new URL(path, window.location.origin).toString(); // mesma origem")
open(f,'w',encoding='utf-8').write(s); print('ok banner buildUrl')
PY
python3 tools/csp-migrate.py . > /tmp/csp-migrate-report.jsonl
python3 - <<'PY'
# 5) js/api-auth.js em todas as telas do sistema (antes de qualquer outro script)
import glob, re, os
n=0
for f in sorted(glob.glob('admin/*.html')+glob.glob('client/*.html')+glob.glob('tech/*.html')+glob.glob('tecnico/*.html')+glob.glob('portal/*.html')):
    s=open(f,encoding='utf-8').read()
    if 'api-auth.js' in s: continue
    tag='<script src="../js/api-auth.js"></script>\n'
    assert re.search(r'</head>', s, re.I), f
    m=re.search(r'<script\b', s[:re.search(r'</head>', s, re.I).start()], re.I)
    pos = m.start() if m else re.search(r'</head>', s, re.I).start()
    s=s[:pos]+tag+s[pos:]
    open(f,'w',encoding='utf-8').write(s); n+=1
print('api-auth.js incluido em', n, 'paginas')
PY
# 6) mantem o fim de linha original (CRLF) dos arquivos que ja eram assim,
#    para o diff mostrar so o que mudou de verdade
for f in $(git diff --name-only); do
  if git show "HEAD:$f" | grep -q $'\r'; then
    python3 -c "import sys;p=sys.argv[1];b=open(p,'rb').read().replace(b'\r\n',b'\n').replace(b'\n',b'\r\n');open(p,'wb').write(b)" "$f"
  fi
done
for f in js/pages/*.js js/csp-events.js js/api-auth.js js/utils.js js/proposals.js; do node --check "$f" || { echo "SINTAXE FALHOU: $f"; exit 1; }; done
echo "BUILD OK: $(ls js/pages | wc -l) arquivos em js/pages"
