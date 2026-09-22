#!/usr/bin/env python3
"""
tools/csp-migrate.py — adapta o frontend a CSP de producao (sem 'unsafe-inline').

O que faz, em cada pagina .html:
  1. Move cada <script> inline para js/pages/<pasta>__<pagina>.js e deixa no
     lugar um <script src="..."> na MESMA posicao (mesma ordem de execucao;
     scripts classicos compartilham o escopo global, entao funcoes e variaveis
     continuam visiveis entre arquivos).
  2. Troca atributos on<evento>="..." por data-on-<evento>="..." — tanto no
     HTML quanto dentro das strings de JS que geram HTML. O texto do handler
     nao muda; quem executa agora e o js/csp-events.js.
  3. No topo do js/pages/*.js gera window.__cspScope com getters/setters para
     os nomes usados nos handlers da pagina (so esses ficam acessiveis).
  4. Inclui <script src=".../js/csp-events.js"> antes de </head>.

Tambem troca os data-on-* nos arquivos js/*.js compartilhados que geram HTML.
Rodar de novo numa arvore ja migrada nao muda nada (nao sobra script inline nem on*=).

Uso:  python3 tools/csp-migrate.py [raiz-do-frontend]
"""
import os, re, sys, glob, json

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')
SKIP_DIRS = ('node_modules', 'cora-api', 'tests-e2e', 'tmp-test', 'Claude outputs', 'playwright-report', 'test-results', 'wazuh-agent', 'nginx', 'tools', 'scripts', 'worker-reset')
EVENTS = ('click|dblclick|change|input|keyup|keydown|keypress|submit|reset|dragover|drop|dragleave|'
          'dragenter|dragstart|dragend|mousedown|mouseup|mouseover|mouseout|mouseenter|mouseleave|'
          'contextmenu|paste|focus|blur|scroll|load|error')
# atributo on*="..." (no HTML ou dentro de string JS, inclusive com aspas escapadas \" \')
ATTR_RE = re.compile(r'(?<=[\s"\'`])on(' + EVENTS + r')(\s*=\s*)(?=\\?["\'])', re.I)
# referencias ao nome do atributo em seletores/getAttribute
SEL_RE = re.compile(r'(\[|(?:get|has|remove|set)Attribute\(\s*[\'"])on(' + EVENTS + r')\b', re.I)
SCRIPT_RE = re.compile(r'<script(\s[^>]*)?>(.*?)</script\s*>', re.S | re.I)
HANDLER_VAL_RE = re.compile(r'data-on-[a-z]+\s*=\s*(\\?)(["\'])(.*?)\1\2', re.S)

JS_KEYWORDS = set('''break case catch class const continue debugger default delete do else export extends
finally for function if import in instanceof let new return super switch this throw try typeof var void
while with yield true false null undefined event NaN Infinity async await of'''.split())
# Nomes que o csp-events.js resolve sozinho (versoes restritas) — NUNCA exportar no escopo
BUILTINS = set('''document window location navigator setTimeout clearTimeout parseInt parseFloat Number
String Boolean Math isNaN encodeURIComponent confirm alert'''.split())
SHARED_JS_DIR = 'js'


def rename_attrs(text):
    text = ATTR_RE.sub(lambda m: 'data-on-' + m.group(1).lower() + m.group(2), text)
    text = SEL_RE.sub(lambda m: m.group(1) + 'data-on-' + m.group(2).lower(), text)
    return text


def handler_identifiers(text):
    """Nomes-raiz usados nos valores data-on-*="..." (inclui os de dentro de ${...})."""
    names = set()
    for m in HANDLER_VAL_RE.finditer(text):
        val = m.group(3)
        # remove strings simples para nao pegar palavras de texto
        val_nostr = re.sub(r"'(?:\\.|[^'\\])*'", "''", val)
        for im in re.finditer(r'(?<![\w$.\'"])([A-Za-z_$][\w$]*)', val_nostr):
            nm = im.group(1)
            if nm in JS_KEYWORDS or nm in BUILTINS:
                continue
            names.add(nm)
    return names


def scope_block(names):
    lines = [
             '/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */',
             ';(function () {',
             '  var s = window.__cspScope || (window.__cspScope = {});',
             '  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }']
    for nm in sorted(names):
        lines.append("  def('%s', function () { return typeof %s !== 'undefined' ? %s : undefined; }, function (v) { %s = v; });" % (nm, nm, nm, nm))
    lines.append('})();')
    lines.append('/* ── fim do bloco gerado ── */')
    lines.append('')
    return '\n'.join(lines) + '\n'


def page_js_name(rel_html):
    base = rel_html[:-5].replace('\\', '/').replace('/', '__')
    return 'js/pages/' + base + '.js'


def shared_scripts_included(html, html_dir):
    out = []
    for m in re.finditer(r'<script[^>]*\bsrc\s*=\s*["\']([^"\']+)["\']', html, re.I):
        src = m.group(1)
        if src.startswith(('http:', 'https:', '//')):
            continue
        p = os.path.normpath(os.path.join(ROOT, html_dir, src.split('?')[0]))
        if p.startswith(os.path.join(ROOT, SHARED_JS_DIR) + os.sep) and '/pages/' not in p.replace('\\', '/') and os.path.isfile(p):
            out.append(p)
    return out


def main():
    report = []
    # 1) arquivos js/*.js compartilhados (geram HTML com onclick)
    shared_names = {}
    for p in sorted(glob.glob(os.path.join(ROOT, SHARED_JS_DIR, '*.js'))):
        if p.endswith(('csp-events.js', 'login.js')):
            continue
        s = open(p, encoding='utf-8').read()
        ns = rename_attrs(s)
        if ns != s:
            open(p, 'w', encoding='utf-8').write(ns)
            report.append({'file': os.path.relpath(p, ROOT), 'kind': 'shared-js', 'renamed': True})
        shared_names[p] = handler_identifiers(ns)

    # 2) paginas
    for p in sorted(glob.glob(os.path.join(ROOT, '**', '*.html'), recursive=True)):
        rel = os.path.relpath(p, ROOT).replace('\\', '/')
        if any(part in rel.split('/') or rel.startswith(part) for part in SKIP_DIRS):
            continue
        html_dir = os.path.dirname(rel)
        html = open(p, encoding='utf-8').read()
        orig = html

        extracted = []

        def repl(m):
            attrs = m.group(1) or ''
            body = m.group(2)
            if re.search(r'\bsrc\s*=', attrs, re.I):
                return m.group(0)
            tm = re.search(r'\btype\s*=\s*["\']([^"\']+)', attrs, re.I)
            if tm and tm.group(1).lower() not in ('text/javascript', 'module', 'application/javascript'):
                return m.group(0)
            if not body.strip():
                return m.group(0)
            extracted.append((attrs, body))
            idx = len(extracted)
            js_rel = page_js_name(rel) if idx == 1 else page_js_name(rel)[:-3] + '.%d.js' % idx
            src = os.path.relpath(os.path.join(ROOT, js_rel), os.path.join(ROOT, html_dir)).replace('\\', '/')
            extracted[-1] = (attrs, body, js_rel)
            return '<script%s src="%s"></script>' % (attrs, src)

        html = SCRIPT_RE.sub(repl, html)
        html = rename_attrs(html)

        names = handler_identifiers(html)
        for i, (attrs, body, js_rel) in enumerate(extracted):
            body = rename_attrs(body)
            names |= handler_identifiers(body)
            extracted[i] = (attrs, body, js_rel)
        for sp in shared_scripts_included(html, html_dir):
            names |= shared_names.get(sp, set())

        uses_handlers = 'data-on-' in html or any('data-on-' in b for _, b, _ in extracted) or bool(names)
        if uses_handlers and 'csp-events.js' not in html:
            shim = os.path.relpath(os.path.join(ROOT, 'js/csp-events.js'), os.path.join(ROOT, html_dir)).replace('\\', '/')
            tag = '<script src="%s"></script>\n' % shim
            if re.search(r'</head>', html, re.I):
                html = re.sub(r'(</head>)', tag + r'\1', html, count=1, flags=re.I)
            else:
                html = tag + html

        # grava os .js extraidos. O bloco de escopo vai no TOPO do primeiro
        # arquivo: se o codigo da pagina lancar erro no meio (ex.: biblioteca
        # externa que nao carregou), os nomes continuam liberados — igual ao
        # comportamento antigo, em que funcoes declaradas ja existiam.
        for i, (attrs, body, js_rel) in enumerate(extracted):
            out = body.strip('\n') + '\n'
            if i == 0 and names:
                block = scope_block(names)
                m = re.match(r'(\s*([\'"])use strict\2;?[ \t]*\n?)', out)
                out = (m.group(1) + block + out[m.end():]) if m else (block + out)
            header = '/* Extraido de %s por tools/csp-migrate.py (CSP sem unsafe-inline). */\n' % rel
            full = os.path.join(ROOT, js_rel)
            os.makedirs(os.path.dirname(full), exist_ok=True)
            open(full, 'w', encoding='utf-8').write(header + out)

        if html != orig:
            open(p, 'w', encoding='utf-8').write(html)
        report.append({'file': rel, 'scripts_extracted': len(extracted),
                       'handlers': len(re.findall(r'data-on-[a-z]+\s*=', html)) + sum(len(re.findall(r'data-on-[a-z]+\s*=', b)) for _, b, _ in extracted),
                       'scope_names': len(names)})

    for r in report:
        print(json.dumps(r, ensure_ascii=False))


if __name__ == '__main__':
    main()
