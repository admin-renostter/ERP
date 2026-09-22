/*
 * js/csp-events.js — substitui os atributos onclick="" / onchange="" etc.
 *
 * Por que existe:
 *   A Content-Security-Policy de producao (cora-api/server.js) nao permite
 *   'unsafe-inline' em script-src. Com isso o navegador bloqueia qualquer
 *   atributo on*="..." no HTML — e nenhum botao funciona.
 *
 * Como funciona:
 *   1. As paginas usam data-on-click="..." (data-on-change, data-on-input...)
 *      no lugar de onclick="...". O texto do atributo e o mesmo de antes.
 *   2. Este arquivo escuta os eventos no document e, para cada elemento com
 *      data-on-<evento> no caminho do evento, interpreta o texto com um
 *      interpretador proprio e restrito (sem eval / new Function — que a CSP
 *      tambem bloqueia).
 *   3. Nomes usados nos handlers (funcoes e variaveis da pagina) vem de
 *      window.__cspScope, gerado no fim de cada js/pages/*.js. Nomes fora
 *      dessa lista NAO sao resolvidos em window — isso evita que HTML
 *      injetado consiga chamar fetch(), ler document.cookie etc.
 *
 * Suporta o subconjunto de JS usado nos handlers do sistema: chamadas,
 * membros (a.b, a[b], a?.b), atribuicao, ===/!==/==/!=, <,>,<=,>=, &&, ||,
 * ??, ternario, !, +,-,*,/,%, strings, numeros, regex, arrays, arrow
 * functions, if/else, return, varios comandos separados por ';'.
 */
(function () {
  'use strict';

  // ───────────────────────── Seguranca ─────────────────────────
  var BLOCKED_MEMBERS = {
    constructor: 1, __proto__: 1, prototype: 1, __defineGetter__: 1,
    __defineSetter__: 1, __lookupGetter__: 1, __lookupSetter__: 1,
    ownerDocument: 1, defaultView: 1, contentWindow: 1, contentDocument: 1,
    innerHTML: 1, outerHTML: 1, insertAdjacentHTML: 1, srcdoc: 1,
    cookie: 1, domain: 1, write: 1, writeln: 1, execCommand: 1,
    setAttribute: 1, setAttributeNS: 1, setAttributeNode: 1,
    eval: 1, Function: 1, importScripts: 1, createContextualFragment: 1
  };
  function checkMember(name, isWrite) {
    name = String(name);
    if (BLOCKED_MEMBERS[name] === 1) throw new Error('membro bloqueado: ' + name);
    if (isWrite && /^on/i.test(name)) throw new Error('atribuicao bloqueada: ' + name);
  }

  function isSafeUrl(url) {
    try {
      var u = new URL(String(url), window.location.href);
      if (u.origin === window.location.origin) return true;
      return u.protocol === 'https:';
    } catch (e) { return false; }
  }
  function isSameOrigin(url) {
    try { return new URL(String(url), window.location.href).origin === window.location.origin; }
    catch (e) { return false; }
  }

  var safeLocation = {
    get href() { return window.location.href; },
    set href(v) {
      if (!isSameOrigin(v)) throw new Error('navegacao externa bloqueada: ' + v);
      window.location.href = v;
    },
    get search() { return window.location.search; },
    get pathname() { return window.location.pathname; },
    reload: function () { window.location.reload(); },
    assign: function (v) { safeLocation.href = v; }
  };
  var safeDocument = {
    getElementById: function (id) { return document.getElementById(id); },
    querySelector: function (s) { return document.querySelector(s); },
    querySelectorAll: function (s) { return document.querySelectorAll(s); },
    getElementsByClassName: function (s) { return document.getElementsByClassName(s); },
    get body() { return document.body; }
  };
  var safeWindow = {
    open: function (url, target, features) {
      if (!isSafeUrl(url)) throw new Error('window.open bloqueado: ' + url);
      return window.open(url, target, features);
    },
    print: function () { window.print(); },
    get location() { return safeLocation; },
    set location(v) { safeLocation.href = v; },
    scrollTo: function (x, y) { window.scrollTo(x, y); }
  };
  var safeNavigator = {
    clipboard: { writeText: function (t) { return navigator.clipboard.writeText(String(t)); } }
  };
  function safeSetTimeout(fn, ms) {
    if (typeof fn !== 'function') throw new Error('setTimeout so aceita funcao');
    return window.setTimeout(fn, ms);
  }
  var BUILTINS = {
    document: safeDocument, window: safeWindow, location: safeLocation,
    navigator: safeNavigator, setTimeout: safeSetTimeout,
    clearTimeout: function (t) { window.clearTimeout(t); },
    parseInt: parseInt, parseFloat: parseFloat, Number: Number, String: String,
    Boolean: Boolean, Math: Math, isNaN: isNaN, encodeURIComponent: encodeURIComponent,
    confirm: function (m) { return window.confirm(m); },
    alert: function (m) { window.alert(m); }
  };

  // ───────────────────────── Tokenizador ─────────────────────────
  var PUNCT = ['===', '!==', '...', '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.',
    '(', ')', '[', ']', '{', '}', ',', ';', '.', '?', ':', '=', '+', '-', '*', '/', '%', '!', '<', '>'];
  var KEYWORDS = { 'true': 1, 'false': 1, 'null': 1, 'undefined': 1, 'this': 1, 'if': 1, 'else': 1, 'return': 1, 'typeof': 1, 'new': 1 };

  function tokenize(src) {
    var toks = [], i = 0, n = src.length;
    function prevAllowsRegex() {
      var t = toks[toks.length - 1];
      if (!t) return true;
      if (t.type === 'num' || t.type === 'str' || t.type === 'regex') return false;
      if (t.type === 'id') return t.value === 'return' || t.value === 'typeof';
      return !(t.value === ')' || t.value === ']' || t.value === '}');
    }
    while (i < n) {
      var c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        var m = /^(?:0[xX][0-9a-fA-F]+|[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?)/.exec(src.slice(i));
        toks.push({ type: 'num', value: Number(m[0]) }); i += m[0].length; continue;
      }
      if (/[A-Za-z_$À-￿]/.test(c)) {
        var m2 = /^[A-Za-z_$À-￿][\w$À-￿]*/.exec(src.slice(i));
        toks.push({ type: 'id', value: m2[0] }); i += m2[0].length; continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        var q = c, j = i + 1, out = '';
        while (j < n && src[j] !== q) {
          if (src[j] === '\\') {
            var e = src[j + 1];
            if (e === 'n') out += '\n'; else if (e === 't') out += '\t'; else if (e === 'r') out += '\r';
            else if (e === 'u') { out += String.fromCharCode(parseInt(src.substr(j + 2, 4), 16)); j += 4; }
            else out += e;
            j += 2;
          } else {
            if (q === '`' && src[j] === '$' && src[j + 1] === '{') throw new Error('template literal com ${} nao suportado');
            out += src[j]; j++;
          }
        }
        if (j >= n) throw new Error('string nao terminada');
        toks.push({ type: 'str', value: out }); i = j + 1; continue;
      }
      if (c === '/' && prevAllowsRegex()) {
        var k = i + 1, inClass = false;
        while (k < n) {
          if (src[k] === '\\') { k += 2; continue; }
          if (src[k] === '[') inClass = true; else if (src[k] === ']') inClass = false;
          else if (src[k] === '/' && !inClass) break;
          k++;
        }
        var flags = /^[a-z]*/.exec(src.slice(k + 1))[0];
        toks.push({ type: 'regex', value: new RegExp(src.slice(i + 1, k), flags) });
        i = k + 1 + flags.length; continue;
      }
      var p = null;
      for (var z = 0; z < PUNCT.length; z++) {
        if (src.substr(i, PUNCT[z].length) === PUNCT[z]) { p = PUNCT[z]; break; }
      }
      if (!p) throw new Error('caractere inesperado: ' + c);
      // "?." seguido de digito e ternario + numero (ex: a?.5:1)
      if (p === '?.' && /[0-9]/.test(src[i + 2] || '')) p = '?';
      toks.push({ type: 'p', value: p }); i += p.length;
    }
    toks.push({ type: 'eof' });
    return toks;
  }

  // ───────────────────────── Parser ─────────────────────────
  function parse(src) {
    var toks = tokenize(src), pos = 0;
    function peek(o) { return toks[pos + (o || 0)]; }
    function next() { return toks[pos++]; }
    function isP(v, o) { var t = peek(o); return t.type === 'p' && t.value === v; }
    function isId(v) { var t = peek(); return t.type === 'id' && t.value === v; }
    function expectP(v) { if (!isP(v)) throw new Error('esperado "' + v + '"'); return next(); }

    function program() {
      var body = [];
      while (peek().type !== 'eof') {
        if (isP(';')) { next(); continue; }
        body.push(statement());
      }
      return { t: 'Prog', body: body };
    }
    function statement() {
      if (isId('if')) {
        next(); expectP('('); var test = expression(); expectP(')');
        var cons = statement(), alt = null;
        if (isP(';') && peek(1).type === 'id' && peek(1).value === 'else') next();
        if (isId('else')) { next(); alt = statement(); }
        return { t: 'If', test: test, cons: cons, alt: alt };
      }
      if (isId('return')) {
        next();
        var arg = (isP(';') || peek().type === 'eof' || isP('}')) ? null : expression();
        return { t: 'Ret', arg: arg };
      }
      if (isP('{')) {
        next(); var b = [];
        while (!isP('}')) { if (isP(';')) { next(); continue; } b.push(statement()); }
        next(); return { t: 'Block', body: b };
      }
      return { t: 'Expr', e: expression() };
    }
    function expression() { return assign(); }
    function assign() {
      // arrow function: () => x | (a, b) => x | a => x
      var arrow = tryArrow(); if (arrow) return arrow;
      var left = ternary();
      if (isP('=')) {
        next();
        if (left.t !== 'Id' && left.t !== 'Mem') throw new Error('alvo de atribuicao invalido');
        return { t: 'Assign', target: left, value: assign() };
      }
      return left;
    }
    function tryArrow() {
      var save = pos;
      if (peek().type === 'id' && !KEYWORDS[peek().value] && isP('=>', 1)) {
        var nm = next().value; next();
        return { t: 'Arrow', params: [nm], body: arrowBody() };
      }
      if (isP('(')) {
        var params = [], j = pos + 1;
        while (toks[j] && toks[j].type === 'id') {
          params.push(toks[j].value); j++;
          if (toks[j] && toks[j].type === 'p' && toks[j].value === ',') { j++; continue; }
          break;
        }
        if (toks[j] && toks[j].type === 'p' && toks[j].value === ')' &&
            toks[j + 1] && toks[j + 1].type === 'p' && toks[j + 1].value === '=>') {
          pos = j + 2;
          return { t: 'Arrow', params: params, body: arrowBody() };
        }
      }
      pos = save; return null;
    }
    function arrowBody() {
      if (isP('{')) return statement();
      return { t: 'Ret', arg: assign() };
    }
    function ternary() {
      var test = binary(0);
      if (isP('?')) {
        next(); var a = assign(); expectP(':'); var b = assign();
        return { t: 'Cond', test: test, a: a, b: b };
      }
      return test;
    }
    var PREC = [['??'], ['||'], ['&&'], ['===', '!==', '==', '!='], ['<', '>', '<=', '>='], ['+', '-'], ['*', '/', '%']];
    function binary(level) {
      if (level >= PREC.length) return unary();
      var left = binary(level + 1);
      while (peek().type === 'p' && PREC[level].indexOf(peek().value) >= 0) {
        var op = next().value;
        left = { t: 'Bin', op: op, l: left, r: binary(level + 1) };
      }
      return left;
    }
    function unary() {
      if (isP('!') || isP('-') || isP('+')) { var op = next().value; return { t: 'Un', op: op, arg: unary() }; }
      if (isId('typeof')) { next(); return { t: 'Un', op: 'typeof', arg: unary() }; }
      if (isId('new')) throw new Error('"new" nao suportado');
      return postfix();
    }
    function postfix() {
      var e = primary();
      for (;;) {
        if (isP('.') || isP('?.')) {
          var opt = next().value === '?.';
          if (opt && isP('(')) { next(); e = { t: 'Call', callee: e, args: args(), opt: true }; continue; }
          if (opt && isP('[')) { next(); var pr = expression(); expectP(']'); e = { t: 'Mem', obj: e, prop: pr, computed: true, opt: true }; continue; }
          var t = next(); if (t.type !== 'id') throw new Error('nome de propriedade esperado');
          e = { t: 'Mem', obj: e, prop: t.value, computed: false, opt: opt };
        } else if (isP('[')) {
          next(); var p = expression(); expectP(']');
          e = { t: 'Mem', obj: e, prop: p, computed: true, opt: false };
        } else if (isP('(')) {
          next(); e = { t: 'Call', callee: e, args: args(), opt: false };
        } else break;
      }
      return e;
    }
    function args() {
      var a = [];
      while (!isP(')')) {
        if (isP('...')) { next(); a.push({ t: 'Spread', arg: assign() }); }
        else a.push(assign());
        if (isP(',')) next(); else break;
      }
      expectP(')'); return a;
    }
    function primary() {
      var t = next();
      if (t.type === 'num' || t.type === 'str' || t.type === 'regex') return { t: 'Lit', v: t.value };
      if (t.type === 'id') {
        if (t.value === 'true') return { t: 'Lit', v: true };
        if (t.value === 'false') return { t: 'Lit', v: false };
        if (t.value === 'null') return { t: 'Lit', v: null };
        if (t.value === 'undefined') return { t: 'Lit', v: undefined };
        if (t.value === 'this') return { t: 'This' };
        return { t: 'Id', name: t.value };
      }
      if (t.type === 'p' && t.value === '(') { var e = expression(); expectP(')'); return e; }
      if (t.type === 'p' && t.value === '[') {
        var items = [];
        while (!isP(']')) { items.push(assign()); if (isP(',')) next(); else break; }
        expectP(']'); return { t: 'Arr', items: items };
      }
      if (t.type === 'p' && t.value === '{') {
        var props = [];
        while (!isP('}')) {
          var k = next(); if (k.type !== 'id' && k.type !== 'str' && k.type !== 'num') throw new Error('chave de objeto invalida');
          var key = String(k.value);
          if (isP(':')) { next(); props.push([key, assign()]); } else props.push([key, { t: 'Id', name: key }]);
          if (isP(',')) next(); else break;
        }
        expectP('}'); return { t: 'Obj', props: props };
      }
      throw new Error('expressao inesperada');
    }
    var ast = program();
    return ast;
  }

  // ───────────────────────── Avaliador ─────────────────────────
  function RetSignal(v) { this.v = v; }

  function scopeHas(name) {
    var s = window.__cspScope;
    return !!s && Object.prototype.hasOwnProperty.call(s, name);
  }
  function lookup(env, name) {
    for (var e = env; e; e = e.parent) {
      if (Object.prototype.hasOwnProperty.call(e.vars, name)) return e.vars[name];
    }
    if (scopeHas(name)) return window.__cspScope[name];
    if (Object.prototype.hasOwnProperty.call(BUILTINS, name)) return BUILTINS[name];
    throw new Error('nome nao liberado para handlers: ' + name);
  }
  function assignName(env, name, value) {
    for (var e = env; e; e = e.parent) {
      if (Object.prototype.hasOwnProperty.call(e.vars, name)) { e.vars[name] = value; return value; }
    }
    if (scopeHas(name)) { window.__cspScope[name] = value; return value; }
    throw new Error('atribuicao a nome nao liberado: ' + name);
  }
  function getMember(obj, prop) {
    checkMember(prop, false);
    if (obj === null || obj === undefined) throw new TypeError('nao e possivel ler "' + prop + '" de ' + obj);
    var v = obj[prop];
    if (v === window || v === document) throw new Error('acesso bloqueado a window/document via ' + prop);
    return v;
  }

  function ev(node, env) {
    switch (node.t) {
      case 'Lit': return node.v;
      case 'This': return env.self;
      case 'Id': return lookup(env, node.name);
      case 'Arr': return node.items.map(function (x) { return ev(x, env); });
      case 'Obj': { var o = {}; node.props.forEach(function (p) { checkMember(p[0], true); o[p[0]] = ev(p[1], env); }); return o; }
      case 'Mem': {
        var obj = ev(node.obj, env);
        if (node.opt && (obj === null || obj === undefined)) return undefined;
        return getMember(obj, node.computed ? ev(node.prop, env) : node.prop);
      }
      case 'Call': return call(node, env);
      case 'Assign': {
        var val = ev(node.value, env);
        if (node.target.t === 'Id') return assignName(env, node.target.name, val);
        var tgt = ev(node.target.obj, env);
        var key = node.target.computed ? ev(node.target.prop, env) : node.target.prop;
        checkMember(key, true);
        if (tgt === null || tgt === undefined) throw new TypeError('nao e possivel definir "' + key + '" em ' + tgt);
        tgt[key] = val; return val;
      }
      case 'Cond': return ev(node.test, env) ? ev(node.a, env) : ev(node.b, env);
      case 'Un': {
        if (node.op === 'typeof') { try { return typeof ev(node.arg, env); } catch (e) { return 'undefined'; } }
        var a = ev(node.arg, env);
        return node.op === '!' ? !a : node.op === '-' ? -a : +a;
      }
      case 'Bin': {
        var op = node.op;
        if (op === '&&') { var l1 = ev(node.l, env); return l1 ? ev(node.r, env) : l1; }
        if (op === '||') { var l2 = ev(node.l, env); return l2 ? l2 : ev(node.r, env); }
        if (op === '??') { var l3 = ev(node.l, env); return (l3 === null || l3 === undefined) ? ev(node.r, env) : l3; }
        var l = ev(node.l, env), r = ev(node.r, env);
        switch (op) {
          case '===': return l === r; case '!==': return l !== r;
          case '==': return l == r; case '!=': return l != r; // eslint-disable-line eqeqeq
          case '<': return l < r; case '>': return l > r; case '<=': return l <= r; case '>=': return l >= r;
          case '+': return l + r; case '-': return l - r; case '*': return l * r; case '/': return l / r; case '%': return l % r;
        }
        throw new Error('operador ' + op);
      }
      case 'Arrow': return makeArrow(node, env);
      default: throw new Error('no ' + node.t);
    }
  }
  function makeArrow(node, env) {
    return function () {
      var vars = {}, a = arguments;
      node.params.forEach(function (p, i) { vars[p] = a[i]; });
      var inner = { vars: vars, parent: env, self: env.self };
      try { exec(node.body, inner); } catch (e) { if (e instanceof RetSignal) return e.v; throw e; }
      return undefined;
    };
  }
  function evalArgs(list, env) {
    var out = [];
    list.forEach(function (a) {
      if (a.t === 'Spread') { var v = ev(a.arg, env); for (var i = 0; i < v.length; i++) out.push(v[i]); }
      else out.push(ev(a, env));
    });
    return out;
  }
  function call(node, env) {
    var fn, thisArg;
    if (node.callee.t === 'Mem') {
      var obj = ev(node.callee.obj, env);
      if (node.callee.opt && (obj === null || obj === undefined)) return undefined;
      var key = node.callee.computed ? ev(node.callee.prop, env) : node.callee.prop;
      fn = getMember(obj, key); thisArg = obj;
    } else {
      fn = ev(node.callee, env); thisArg = undefined;
    }
    if (node.opt && (fn === null || fn === undefined)) return undefined;
    if (typeof fn !== 'function') throw new TypeError('nao e uma funcao');
    if (fn === Function || fn === window.eval || fn === window.setInterval) throw new Error('funcao bloqueada');
    return fn.apply(thisArg, evalArgs(node.args, env));
  }
  function exec(node, env) {
    switch (node.t) {
      case 'Prog': case 'Block': { var last; node.body.forEach(function (s) { last = exec(s, env); }); return last; }
      case 'Expr': return ev(node.e, env);
      case 'If': return ev(node.test, env) ? exec(node.cons, env) : (node.alt ? exec(node.alt, env) : undefined);
      case 'Ret': throw new RetSignal(node.arg ? ev(node.arg, env) : undefined);
      default: throw new Error('comando ' + node.t);
    }
  }

  var cache = new Map();
  function compile(code) {
    var ast = cache.get(code);
    if (!ast) { ast = parse(code); cache.set(code, ast); }
    return ast;
  }
  function run(code, el, event) {
    var env = { vars: { event: event }, parent: null, self: el };
    try { exec(compile(code), env); }
    catch (e) {
      if (e instanceof RetSignal) return e.v;
      throw e;
    }
    return undefined;
  }

  // ───────────────────────── Delegacao de eventos ─────────────────────────
  var BUBBLING = ['click', 'dblclick', 'change', 'input', 'keyup', 'keydown', 'keypress', 'submit', 'reset',
    'dragover', 'drop', 'dragleave', 'dragenter', 'dragstart', 'dragend', 'mousedown', 'mouseup',
    'mouseover', 'mouseout', 'contextmenu', 'paste'];
  var NON_BUBBLING = ['focus', 'blur', 'mouseenter', 'mouseleave', 'scroll', 'load', 'error'];

  function dispatch(event, onlyTarget) {
    var type = event.type, attr = 'data-on-' + type;
    var path = [];
    if (onlyTarget) { if (event.target && event.target.getAttribute) path.push(event.target); }
    else {
      for (var n = event.target; n && n !== document; n = n.parentNode) {
        if (n.nodeType === 1) path.push(n);
      }
    }
    for (var i = 0; i < path.length; i++) {
      var el = path[i];
      if (!el.hasAttribute(attr)) continue;
      var code = el.getAttribute(attr);
      try {
        var r = run(code, el, event);
        if (r === false) event.preventDefault();
      } catch (err) {
        console.error('[csp-events] erro em ' + attr + '="' + code + '":', err);
      }
      if (event.cancelBubble) break; // handler chamou event.stopPropagation()
    }
  }
  BUBBLING.forEach(function (t) { document.addEventListener(t, function (e) { dispatch(e, false); }, false); });
  NON_BUBBLING.forEach(function (t) { document.addEventListener(t, function (e) { dispatch(e, true); }, true); });

  // Auditoria (usada nos testes): tenta interpretar todo data-on-* presente
  // na pagina e confere se todos os nomes usados estao liberados.
  function audit() {
    var problems = [], seen = 0;
    var all = document.querySelectorAll('*');
    function names(node, out) {
      if (!node || typeof node !== 'object') return;
      if (node.t === 'Id') out.push(node.name);
      if (node.t === 'Arrow') { var inner = []; names(node.body, inner); inner.forEach(function (x) { if (node.params.indexOf(x) < 0) out.push(x); }); return; }
      Object.keys(node).forEach(function (k) {
        var v = node[k];
        if (k === 'prop' && node.t === 'Mem' && !node.computed) return;
        if (Array.isArray(v)) v.forEach(function (x) { if (Array.isArray(x)) names(x[1], out); else names(x, out); });
        else if (v && typeof v === 'object' && v.t) names(v, out);
      });
    }
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      for (var j = 0; j < el.attributes.length; j++) {
        var a = el.attributes[j];
        if (a.name.indexOf('data-on-') !== 0) continue;
        seen++;
        try {
          var ids = []; names(compile(a.value), ids);
          ids.forEach(function (nm) {
            if (nm === 'event') return;
            if (!scopeHas(nm) && !Object.prototype.hasOwnProperty.call(BUILTINS, nm)) problems.push({ attr: a.name, code: a.value, problem: 'nome nao liberado: ' + nm });
            else if (scopeHas(nm) && window.__cspScope[nm] === undefined) problems.push({ attr: a.name, code: a.value, problem: 'nome indefinido: ' + nm });
          });
        } catch (e) { problems.push({ attr: a.name, code: a.value, problem: String(e.message || e) }); }
      }
    }
    return { handlers: seen, problems: problems };
  }

  window.__cspEvents = { run: run, parse: parse, audit: audit };
})();
