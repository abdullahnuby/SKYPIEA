(function (w, d) {
  'use strict';
  if (w.BenoChat) return;
  var script = d.currentScript;
  var data = script && script.dataset ? script.dataset : {};
  var src = script && script.src ? script.src : d.baseURI;
  var apiBase = data.api || '';
  var dir = data.dir || 'rtl';
  var position = data.position || (dir === 'rtl' ? 'right' : 'right');
  var autoOpen = data.autoopen !== 'false';
  var config = {
    api: apiBase.replace(/\/$/, ''), dir: dir, position: position,
    brand: data.brand || 'Beno', accent: data.accent || '#156e68',
    logo: data.logo || '', whatsapp: (data.whatsapp || '').replace(/\D/g, ''),
    theme: data.theme || 'auto', autoOpen: autoOpen,
    chunkUrl: src.replace(/beno-chat\.js(?:\?.*)?$/, 'beno-chat.chunk.js')
  };
  var host = d.createElement('div');
  host.setAttribute('data-beno-chat-root', '');
  var shadow = host.attachShadow({ mode: 'open' });
  var style = d.createElement('style');
  style.textContent = ':host{all:initial;position:fixed;inset:0;z-index:2147482000;pointer-events:none;color-scheme:light dark}*{box-sizing:border-box}.beno-launcher{all:initial;pointer-events:auto;position:fixed;bottom:calc(22px + env(safe-area-inset-bottom,0px));'+(position==='right'?'right':'left')+':22px;min-width:174px;height:58px;padding:0 17px 0 15px;border-radius:18px;border:1px solid rgba(255,255,255,.22);background:linear-gradient(135deg,#2d6aef,#234fc5);box-shadow:0 12px 34px rgba(31,79,180,.34),inset 0 1px rgba(255,255,255,.22);color:#fff;display:flex;align-items:center;justify-content:center;gap:11px;cursor:pointer;font:750 13px/1.25 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;outline-offset:4px;transition:transform .18s ease,box-shadow .18s ease}.beno-launcher:hover{transform:translateY(-3px);box-shadow:0 17px 38px rgba(31,79,180,.4),inset 0 1px rgba(255,255,255,.22)}.beno-launcher[hidden]{display:none!important}.beno-launcher:focus-visible{outline:3px solid #8fb0ff}.beno-launcher svg{width:25px;height:25px;flex:none}.beno-launcher .launcher-copy{display:grid;gap:3px;text-align:start}.beno-launcher .launcher-copy strong{font-size:13px;font-weight:850}.beno-launcher .launcher-copy small{font-size:10px;font-weight:550;color:rgba(255,255,255,.79)}@media(max-width:480px){.beno-launcher{bottom:calc(12px + env(safe-area-inset-bottom,0px));'+(position==='right'?'right':'left')+':12px;min-width:156px;height:54px;padding:0 13px;border-radius:16px}}@media(prefers-reduced-motion:reduce){.beno-launcher{transition:none}}';
  var button = d.createElement('button');
  button.type = 'button'; button.className = 'beno-launcher'; button.setAttribute('aria-label', 'افتح Beno، مهندس التسعير الذكي'); button.setAttribute('aria-haspopup', 'dialog');
  button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 5.5A3.5 3.5 0 0 1 8.5 2h7A3.5 3.5 0 0 1 19 5.5v7a3.5 3.5 0 0 1-3.5 3.5H11l-5 4v-4.4A3.5 3.5 0 0 1 5 12.5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.5 7.5h7M8.5 10.5h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg><span class="launcher-copy"><strong>Beno</strong><small>احسب مع مهندس التسعير</small></span>';
  shadow.append(style, button); d.documentElement.appendChild(host);
  var opened = false, chunkLoading = null, mounted = false, api = {};
  var STORAGE = 'beno-chat:v1:';
  function storageGet(key) { try { return w.localStorage.getItem(STORAGE + key); } catch (_) { return null; } }
  function storageSet(key, value) { try { w.localStorage.setItem(STORAGE + key, value); } catch (_) {} }
  function typingOnPage() {
    var a = d.activeElement;
    return !!(a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable));
  }
  function loadChunk() {
    if (mounted) return Promise.resolve(true);
    if (chunkLoading) return chunkLoading;
    chunkLoading = new Promise(function (resolve) {
      var s = d.createElement('script'); s.async = true; s.src = config.chunkUrl;
      s.onload = function () { mounted = true; resolve(true); };
      s.onerror = function () { chunkLoading = null; resolve(false); };
      (d.head || d.documentElement).appendChild(s);
    });
    return chunkLoading;
  }
  api.open = function (reason) {
    opened = true;
    loadChunk().then(function (ok) {
      if (!ok) { button.setAttribute('aria-label', 'تعذر تحميل الشات. اضغط لإعادة المحاولة'); return; }
      if (typeof api._open === 'function') api._open(reason || 'manual');
      button.hidden = true;
    });
  };
  api.close = function () { if (typeof api._close === 'function') api._close(); opened = false; button.hidden = false; storageSet('closedAt', String(Date.now())); };
  api.configure = function (options) { if (!options || typeof options !== 'object') return; ['brand','accent','logo','whatsapp','api','dir','position','theme'].forEach(function(k){if(typeof options[k]==='string')config[k]=options[k];}); };
  api._register = function (handlers) { handlers=handlers||{};api._open=handlers.open;api._close=handlers.close;api._config=config;api._host=host;api._shadow=shadow;api._button=button;api._storage={get:storageGet,set:storageSet}; };
  api._register({});
  w.BenoChat = api;
  button.addEventListener('click', function () { api.open('manual'); });
  button.addEventListener('pointerenter', function () { loadChunk(); }, { passive: true });
  button.addEventListener('touchstart', function () { loadChunk(); }, { passive: true, once: true });
  function shouldAutoOpen() {
    if (!config.autoOpen || opened || typingOnPage()) return false;
    var closed = Number(storageGet('closedAt') || 0), shown = Number(storageGet('autoLast') || 0);
    var week = 7 * 24 * 60 * 60 * 1000;
    return Date.now() - Math.max(closed, shown) >= week;
  }
  var fired = false;
  function autoTry() { if (fired) return; if (typingOnPage()) return; if (!shouldAutoOpen()) { fired = true; return; } fired = true; storageSet('autoLast', String(Date.now())); api.open('auto'); }
  var timer = w.setTimeout(autoTry, 4000);
  function scrollTry() { if (fired) return; var max = d.documentElement.scrollHeight - w.innerHeight; if (max > 0 && (w.scrollY / max) >= .35) { autoTry(); if (fired) w.removeEventListener('scroll', scrollTry); } }
  w.addEventListener('scroll', scrollTry, { passive: true });
  d.addEventListener('focusout', function () { if (!fired) autoTry(); }, true);
  d.addEventListener('visibilitychange', function () { if (d.visibilityState === 'visible' && !fired) { /* preserve the 4 second/scroll contract without hidden-tab surprise */ } });
})(window, document);
