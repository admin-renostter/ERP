/*
 * js/api-auth.js — envia o token de login em todas as chamadas a API do sistema.
 *
 * Problema que resolve:
 *   O login guarda a sessao em sessionStorage['rcrm_session'] (js/auth.js),
 *   mas varias telas procuravam o token em outros lugares (localStorage 'jwt',
 *   sessionStorage 'rcrm_token') ou nao enviavam token nenhum. Em producao a API
 *   so aceita JWT (AUTH_MODE=jwt), entao essas chamadas voltavam 401 e a tela
 *   ficava vazia ou o botao "nao fazia nada".
 *
 * O que faz:
 *   Para chamadas fetch() a mesma origem em /api/..., se a requisicao nao tiver
 *   Authorization (ou tiver "Bearer " vazio / "Bearer null"), acrescenta
 *   "Authorization: Bearer <token da sessao>". Chamadas para outros dominios
 *   nunca recebem o token.
 */
(function () {
  'use strict';
  if (!window.fetch || window.__apiAuthPatched) return;
  window.__apiAuthPatched = true;

  var SESSION_KEY = 'rcrm_session';
  var EMPTY_BEARER = /^Bearer\s*(null|undefined)?\s*$/i;

  function currentToken() {
    try {
      var s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      return s && s.accessToken ? s.accessToken : null;
    } catch (e) { return null; }
  }

  var originalFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      var isRequest = typeof Request !== 'undefined' && input instanceof Request;
      var url = new URL(isRequest ? input.url : String(input), window.location.href);
      if (url.origin === window.location.origin && url.pathname.indexOf('/api/') === 0) {
        var token = currentToken();
        if (token) {
          var headers = new Headers((init && init.headers) || (isRequest ? input.headers : undefined));
          var current = headers.get('Authorization');
          if (!current || EMPTY_BEARER.test(current)) {
            headers.set('Authorization', 'Bearer ' + token);
            init = Object.assign({}, init || {}, { headers: headers });
          }
        }
      }
    } catch (e) { /* URL invalida: segue sem mexer */ }
    return originalFetch(input, init);
  };
})();
