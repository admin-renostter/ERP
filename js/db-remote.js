/*
 * js/db-remote.js — liga Clientes, Chamados e Comentarios ao banco.
 *
 * As telas usam o objeto `db` (js/storage.js), que guarda tudo no
 * localStorage do navegador. Este arquivo, carregado logo depois do
 * storage.js, faz o banco virar a fonte da verdade para 4 colecoes:
 *
 *   clients  <-> /api/crm/clientes      (tabela clientes)
 *   tickets  <-> /api/crm/chamados      (tabela chamados)
 *   comments <-> /api/crm/comentarios   (tabela chamado_comentarios)
 *   users    <-  /api/crm/equipe        (usuarios reais, so leitura)
 *
 * 1. Ao abrir a pagina, busca os dados no servidor e substitui a copia do
 *    navegador (os dados de demonstracao somem).
 * 2. Toda gravacao dessas colecoes pela tela (db.insert / db.update /
 *    db.delete) e enviada ao servidor. Se o servidor recusar, a alteracao
 *    local e desfeita e aparece um aviso — nada fica "salvo" so no navegador.
 *
 * As chamadas sao sincronas de proposito: as telas foram escritas esperando
 * que db.get() ja tenha os dados na hora em que o script da pagina roda.
 */
(function () {
  'use strict';
  if (typeof db === 'undefined') return;

  var API = '/api/crm';
  var SYNCED = { clients: 1, tickets: 1, comments: 1 };

  // ─────────────── valores: tela <-> banco ───────────────
  var STATUS_UI_DB = {
    aberto: 'Aberto', agendado: 'Aberto', andamento: 'Em Andamento', aguardando: 'Aguardando Peça',
    aguardando_aprovacao: 'Aguardando Peça', aguardando_aprovacao_pecas: 'Aguardando Peça',
    resolvido: 'Resolvido', fechado: 'Fechado', cancelado: 'Cancelado'
  };
  var STATUS_DB_UI = {
    'Aberto': 'aberto', 'Em Andamento': 'andamento', 'Aguardando Peça': 'aguardando', 'Resolvido': 'resolvido',
    'Fechado': 'fechado', 'Cancelado': 'cancelado', 'Reaberto': 'aberto', 'Em Garantia': 'andamento'
  };
  var PRIO_UI_DB = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' };
  var PRIO_DB_UI = { 'Baixa': 'baixa', 'Média': 'media', 'Alta': 'alta', 'Crítica': 'critica' };
  var CAT_UI_DB = {
    corretiva: 'Manutenção Corretiva', preventiva: 'Manutenção Preventiva', instalacao: 'Instalação',
    higienizacao: 'Manutenção Preventiva', gas: 'Manutenção Corretiva', pmoc: 'Manutenção Preventiva',
    outros: 'Suporte Técnico'
  };
  var CAT_DB_UI = {
    'Manutenção Corretiva': 'corretiva', 'Manutenção Preventiva': 'preventiva', 'Instalação': 'instalacao',
    'Desinstalação': 'outros', 'Vistoria': 'outros', 'Orçamento': 'outros', 'Suporte Técnico': 'outros', 'Geral': 'outros'
  };

  function parse(s) { if (!s) return {}; try { var o = JSON.parse(s); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; } }
  function iso(v) { if (!v) return null; var d = new Date(v); return isNaN(d) ? null : d.toISOString(); }
  function omit(obj, keys) { var o = {}; Object.keys(obj || {}).forEach(function (k) { if (keys.indexOf(k) < 0) o[k] = obj[k]; }); return o; }

  var equipe = {};

  function fromCliente(r) {
    var d = parse(r.dados_json);
    var c = Object.assign({}, d, {
      id: r.id,
      razaoSocial: d.razaoSocial || r.nome,
      fantasia: r.fantasia || d.fantasia || r.nome,
      cnpj: r.cnpj_cpf || r.cnpj || d.cnpj || '',
      email: r.email || '',
      telefone: r.telefone || '',
      celular: r.celular || '',
      status: r.status || 'ativo'
    });
    c.createdAt = d.createdAt || iso(r.created_at);
    return c;
  }
  function toCliente(c) {
    return {
      id: c.id,
      nome: c.razaoSocial || c.fantasia || c.contato || 'Sem nome',
      fantasia: c.fantasia || null,
      email: c.email || null,
      telefone: c.telefone || null,
      celular: c.celular || null,
      cnpj_cpf: c.cnpj || null,
      status: c.status || 'ativo',
      endereco: [c.logradouro, c.numero, c.complemento, c.bairro].filter(Boolean).join(', ') || null,
      cidade: c.cidade || null,
      estado: c.uf || null,
      cep: c.cep || null,
      dados: omit(c, ['id'])
    };
  }

  function fromChamado(r) {
    var d = parse(r.dados_json);
    var t = Object.assign({}, d);
    t.id = r.id;
    t.num = r.numero || d.num || ('#' + String(r.id).slice(-5).toUpperCase());
    t.clientId = r.cliente_id;
    t.title = r.titulo;
    t.description = r.descricao || '';
    t.priority = (d.priority && PRIO_UI_DB[d.priority] === r.prioridade) ? d.priority : (PRIO_DB_UI[r.prioridade] || 'media');
    t.category = (d.category && CAT_UI_DB[d.category] === r.categoria) ? d.category : (CAT_DB_UI[r.categoria] || d.category || 'outros');
    // status: mantem o detalhe da tela (ex.: aguardando_aprovacao) se ainda bate com o banco;
    // se outro modulo (portal, garantia, app) mudou o status, vale o do banco.
    t.status = (d.status && STATUS_UI_DB[d.status] === r.status) ? d.status : (STATUS_DB_UI[r.status] || 'aberto');
    t.assignedTo = r.tecnico_id || null;
    t.assignedName = r.tecnico_id ? ((equipe[r.tecnico_id] && equipe[r.tecnico_id].name) || d.assignedName || '') : null;
    t.createdAt = d.createdAt || iso(r.data_abertura);
    t.updatedAt = iso(r.updated_at) || d.updatedAt;
    if (!t.clientName) {
      var cl = db.find('clients', r.cliente_id);
      t.clientName = cl ? (cl.fantasia || cl.razaoSocial) : r.cliente_id;
    }
    if (!t.slaRefDate && typeof calculateSlaDeadlines === 'function') {
      Object.assign(t, calculateSlaDeadlines(t.priority, t.category, new Date(t.createdAt || Date.now())));
    }
    return t;
  }
  function toChamado(t) {
    return {
      id: t.id,
      numero: t.num || null,
      cliente_id: t.clientId,
      tecnico_id: (t.assignedTo && equipe[t.assignedTo]) ? t.assignedTo : null,
      titulo: t.title || 'Sem título',
      descricao: t.description || '',
      categoria: CAT_UI_DB[t.category] || 'Manutenção Corretiva',
      prioridade: PRIO_UI_DB[t.priority] || 'Média',
      status: STATUS_UI_DB[t.status] || 'Aberto',
      dados: omit(t, ['id'])
    };
  }

  function fromComentario(r) {
    var d = parse(r.dados_json);
    return Object.assign({}, d, {
      id: r.id,
      ticketId: r.chamado_id,
      authorId: r.autor_id,
      authorName: r.autor_nome || d.authorName || '',
      authorRole: (r.autor_papel === 'tech' ? 'tecnico' : r.autor_papel) || d.authorRole,
      text: r.texto || '',
      internal: !!(r.interno && r.interno !== '0'),
      createdAt: iso(r.created_at) || d.createdAt
    });
  }
  function toComentario(c) {
    return { id: c.id, texto: c.text || '', interno: !!c.internal, dados: omit(c, ['id', 'ticketId', 'text', 'internal']) };
  }

  // ─────────────── HTTP (sincrono) ───────────────
  function token() {
    try { var s = JSON.parse(sessionStorage.getItem('rcrm_session') || 'null'); return s && s.accessToken; } catch (e) { return null; }
  }
  function req(method, path, body) {
    var x = new XMLHttpRequest();
    try {
      x.open(method, API + path, false);
      x.setRequestHeader('Content-Type', 'application/json');
      var tk = token(); if (tk) x.setRequestHeader('Authorization', 'Bearer ' + tk);
      x.send(body === undefined ? null : JSON.stringify(body));
    } catch (e) { return { ok: false, status: 0, error: 'Sem conexão com o servidor' }; }
    var data = null; try { data = JSON.parse(x.responseText); } catch (e) { /* sem corpo */ }
    var ok = x.status >= 200 && x.status < 300 && data && data.success !== false;
    return { ok: ok, status: x.status, data: data && data.data, error: (data && data.error) || ('Erro ' + x.status) };
  }
  function avisar(titulo, msg) {
    if (typeof toast === 'function') toast(titulo, msg, 'error');
    else setTimeout(function () { if (typeof toast === 'function') toast(titulo, msg, 'error'); }, 500);
    console.error('[db-remote]', titulo, msg);
  }

  // ─────────────── carga inicial ───────────────
  var status = { carregado: false, erro: null };
  function carregar() {
    var eq = req('GET', '/equipe');
    var cl = req('GET', '/clientes');
    var ch = req('GET', '/chamados');
    var cm = req('GET', '/comentarios');
    var falha = [eq, cl, ch, cm].filter(function (r) { return !r.ok; })[0];
    if (falha) {
      status.erro = falha.error;
      // Nunca mostrar dados de demonstracao como se fossem reais.
      db.set('clients', []); db.set('tickets', []); db.set('comments', []);
      avisar('Não foi possível carregar os dados', falha.status === 401 ? 'Sua sessão expirou. Entre de novo.' : falha.error);
      return;
    }
    equipe = {};
    (eq.data || []).forEach(function (u) { equipe[u.id] = u; });
    db.set('users', (eq.data || []).map(function (u) {
      return { id: u.id, name: u.name, email: u.email, role: u.role === 'tech' ? 'tecnico' : u.role, clientId: u.clientId };
    }));
    db.set('clients', (cl.data || []).filter(function (r) { return r.status !== 'excluido'; }).map(fromCliente));
    db.set('tickets', (ch.data || []).map(fromChamado));
    db.set('comments', (cm.data || []).map(fromComentario));
    status.carregado = true;
  }

  // ─────────────── gravacao ───────────────
  var orig = { insert: db.insert, update: db.update, delete: db.delete };
  var ROTA = { clients: '/clientes', tickets: '/chamados' };
  var CONV = { clients: toCliente, tickets: toChamado };
  var NOME = { clients: 'o cliente', tickets: 'o chamado', comments: 'o comentário' };

  db.insert = function (col, data) {
    var rec = orig.insert.call(db, col, data);
    if (!SYNCED[col] || !status.carregado) return rec;
    var r = col === 'comments'
      ? req('POST', '/chamados/' + encodeURIComponent(rec.ticketId) + '/comentarios', toComentario(rec))
      : req('POST', ROTA[col], CONV[col](rec));
    if (!r.ok) {
      orig.delete.call(db, col, rec.id);
      avisar('Não foi possível salvar ' + NOME[col], r.error);
      throw new Error(r.error);
    }
    return rec;
  };

  db.update = function (col, id, data) {
    var antes = SYNCED[col] ? db.find(col, id) : null;
    var rec = orig.update.call(db, col, id, data);
    if (!SYNCED[col] || !status.carregado || !rec || col === 'comments') return rec;
    var r = req('PATCH', ROTA[col] + '/' + encodeURIComponent(id), CONV[col](rec));
    if (!r.ok) {
      if (antes) { var all = db.get(col); var i = all.findIndex(function (x) { return x.id === id; }); if (i >= 0) { all[i] = antes; db.set(col, all); } }
      avisar('Não foi possível salvar ' + NOME[col], r.error);
      throw new Error(r.error);
    }
    return rec;
  };

  db.delete = function (col, id) {
    if (SYNCED[col] && status.carregado && col !== 'comments') {
      var r = req('DELETE', ROTA[col] + '/' + encodeURIComponent(id));
      if (!r.ok) { avisar('Não foi possível excluir ' + NOME[col], r.error); throw new Error(r.error); }
    }
    return orig.delete.call(db, col, id);
  };

  // Fotos anexadas aos chamados: reduz para no maximo 1280px em JPEG antes de
  // gravar (uma foto de celular de 2 MB vira ~150-300 KB). Se nao der, usa a original.
  function reduzirImagem(dataUrl, cb) {
    if (!/^data:image\//.test(dataUrl || '')) return cb(dataUrl);
    var img = new Image();
    img.onload = function () {
      try {
        var k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k));
        c.height = Math.max(1, Math.round(img.naturalHeight * k));
        var g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        var out = c.toDataURL('image/jpeg', 0.72);
        cb(out.length < dataUrl.length ? out : dataUrl);
      } catch (e) { cb(dataUrl); }
    };
    img.onerror = function () { cb(dataUrl); };
    img.src = dataUrl;
  }

  carregar();
  window.dbRemote = { status: status, recarregar: carregar, reduzirImagem: reduzirImagem, map: { fromChamado: fromChamado, toChamado: toChamado } };
})();
