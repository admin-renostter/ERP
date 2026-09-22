#!/usr/bin/env python3
"""
tools/fix-encoding.py — conserta acentos/emojis corrompidos (mojibake) e remove BOM.

Alguns arquivos foram abertos como Windows-1252 e salvos de novo como UTF-8,
transformando por exemplo "⚠️" em "⚠ï¸" e "→" em "â†'". Este script refaz a
conversao inversa apenas nos trechos que formam UTF-8 valido, entao texto
normal ("ção", "é") nao e alterado. Tambem remove o BOM do inicio do arquivo.

Uso:  python3 tools/fix-encoding.py [raiz-do-frontend]
"""
import glob, os, re, sys

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')
rev = {}
for b in range(0x80, 0x100):
    try:
        rev[bytes([b]).decode('cp1252')] = b
    except UnicodeDecodeError:
        pass
    rev.setdefault(chr(b), b)
RUN = re.compile('[' + re.escape(''.join(rev.keys())) + ']{2,}')
# casos em que um caractere do meio ainda foi trocado por ASCII depois (quebra JS)
SPECIAL = {"â†'": "→"}  # "â†'" -> "→"


def fix(m):
    t = m.group(0)
    try:
        return bytes(rev[c] for c in t).decode('utf-8')
    except Exception:
        return t


total = 0
files = glob.glob(os.path.join(ROOT, '**', '*.html'), recursive=True) + glob.glob(os.path.join(ROOT, 'js', '*.js'))
for f in sorted(files):
    if 'node_modules' in f or os.sep + 'cora-api' + os.sep in f:
        continue
    b = open(f, 'rb').read()
    bom = b.startswith(b'\xef\xbb\xbf')
    s = (b[3:] if bom else b).decode('utf-8')
    n = sum(1 for m in RUN.finditer(s) if fix(m) != m.group(0))
    new = RUN.sub(fix, s)
    for k, v in SPECIAL.items():
        n += new.count(k)
        new = new.replace(k, v)
    if bom or n:
        open(f, 'wb').write(new.encode('utf-8'))
        print('%s: BOM=%s trechos=%d' % (os.path.relpath(f, ROOT), bom, n))
        total += n
print('TOTAL trechos corrigidos:', total)
