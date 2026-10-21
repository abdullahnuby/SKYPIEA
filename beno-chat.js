(function (w, d) {
  'use strict';
  if (w.BenoChat) return;
  var script = d.currentScript;
  var data = script && script.dataset ? script.dataset : {};
  var src = script && script.src ? script.src : d.baseURI;
  var apiBase = data.api || '';
  var dir = data.dir || 'rtl';
  var position = data.position || 'right';
  var autoOpen = data.autoopen !== 'false';
  var config = {
    api: apiBase.replace(/\/$/, ''), dir: dir, position: position,
    brand: data.brand || 'Beno', accent: /^#[\da-f]{3,8}$/i.test(data.accent || '') ? data.accent : '#2864e8',
    logo: data.logo || '', whatsapp: (data.whatsapp || '').replace(/\D/g, ''),
    theme: data.theme || 'auto', autoOpen: autoOpen,
    welcomeEnabled: data.welcome !== 'false',
    chunkUrl: src.replace(/beno-chat\.js(?:\?.*)?$/, 'beno-chat.chunk.js')
  };
  var host = d.createElement('div');
  host.setAttribute('data-beno-chat-root', '');
  host.style.setProperty('--beno-widget-accent', config.accent);
  var shadow = host.attachShadow({ mode: 'open' });
  var style = d.createElement('style');
  var side = position === 'left' ? 'left' : 'right';
  style.textContent = `
    :host{all:initial;position:fixed;inset:0;z-index:2147482000;pointer-events:none;color-scheme:light dark;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    *,*::before,*::after{box-sizing:border-box}
    .beno-launcher{all:initial;box-sizing:border-box;pointer-events:auto;position:fixed;bottom:calc(22px + env(safe-area-inset-bottom,0px));${side}:22px;min-width:226px;height:66px;padding:8px 13px 8px 10px;border-radius:21px;border:1px solid rgba(255,255,255,.35);background:linear-gradient(135deg,var(--beno-widget-accent,#2864e8),#153a80 92%);box-shadow:0 14px 36px rgba(18,48,103,.28),0 3px 9px rgba(18,48,103,.13),inset 0 1px rgba(255,255,255,.2);color:#fff;display:flex;align-items:center;justify-content:flex-start;gap:11px;direction:rtl;cursor:pointer;font:700 13px/1.3 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;outline-offset:4px;transition:transform .2s ease,box-shadow .2s ease;overflow:visible}
    .beno-launcher:before{content:"";position:absolute;inset:-5px;border-radius:25px;border:1px solid rgba(40,100,232,.18);pointer-events:none;opacity:0;transition:opacity .2s ease}
    .beno-launcher:hover{transform:translateY(-3px);box-shadow:0 18px 42px rgba(18,48,103,.34),inset 0 1px rgba(255,255,255,.22)}
    .beno-launcher:hover:before{opacity:1}
    .beno-launcher[hidden],.beno-welcome-toast[hidden]{display:none!important}
    .beno-launcher:focus-visible,.beno-welcome-toast button:focus-visible{outline:3px solid #8fb0ff;outline-offset:3px}
    .launcher-mark{position:relative;display:grid;place-items:center;flex:0 0 43px;width:43px;height:43px;border:1px solid rgba(255,255,255,.42);border-radius:14px;background:linear-gradient(145deg,rgba(255,255,255,.25),rgba(255,255,255,.08));box-shadow:inset 0 1px rgba(255,255,255,.24);font:850 22px/1 system-ui,sans-serif;letter-spacing:-1.5px}
    .launcher-mark .launcher-status{position:absolute;right:-3px;bottom:-3px;width:11px;height:11px;border:2px solid #174080;border-radius:50%;background:#37d69a}
    .launcher-copy{display:grid;gap:4px;min-width:0;text-align:start;flex:1}
    .launcher-copy strong{font-size:15px;line-height:1;font-weight:850;letter-spacing:.1px}
    .launcher-copy small{display:block;font-size:10px;font-weight:550;color:rgba(255,255,255,.82);white-space:nowrap}
    .launcher-arrow{display:grid;place-items:center;flex:0 0 27px;width:27px;height:27px;border-radius:9px;background:rgba(255,255,255,.13);font:600 15px/1 system-ui,sans-serif}
    .beno-launcher.is-compact{width:60px;min-width:60px;height:60px;padding:8px;justify-content:center;border-radius:19px}.beno-launcher.is-compact .launcher-copy,.beno-launcher.is-compact .launcher-arrow{display:none}.beno-launcher.is-compact .launcher-mark{flex-basis:42px;width:42px;height:42px}
    .beno-welcome-toast{all:initial;box-sizing:border-box;pointer-events:auto;position:fixed;bottom:calc(98px + env(safe-area-inset-bottom,0px));${side}:22px;width:min(370px,calc(100vw - 30px));max-height:min(286px,calc(100dvh - 118px));overflow:auto;overscroll-behavior:contain;direction:rtl;text-align:start;padding:16px 16px 13px;border:1px solid #dce5f3;border-radius:21px;background:linear-gradient(145deg,#fff 0%,#f8fbff 100%);color:#172b4a;box-shadow:0 24px 65px rgba(11,31,67,.22),0 5px 18px rgba(11,31,67,.09);font:400 13px/1.65 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;opacity:1;transform:translateY(0) scale(1);transform-origin:${side === 'right' ? 'bottom right' : 'bottom left'};animation:beno-welcome-enter .34s cubic-bezier(.2,.8,.2,1) both}
    .beno-welcome-toast:after{content:"";position:absolute;${side}:31px;bottom:-6px;width:12px;height:12px;transform:rotate(45deg);background:#f8fbff;border-right:1px solid #dce5f3;border-bottom:1px solid #dce5f3;pointer-events:none}
    .beno-welcome-head{display:flex;align-items:center;gap:10px;position:relative;z-index:1}
    .beno-welcome-avatar{display:grid;place-items:center;flex:0 0 42px;width:42px;height:42px;border-radius:14px;background:linear-gradient(145deg,var(--beno-widget-accent,#2864e8),#143675);box-shadow:0 7px 16px rgba(39,91,193,.23);color:#fff;font:850 21px/1 system-ui,sans-serif;letter-spacing:-1px}
    .beno-welcome-title{min-width:0;flex:1;display:grid;gap:2px}
    .beno-welcome-title strong{color:#142a4d;font-size:14px;font-weight:850;line-height:1.35}
    .beno-welcome-title small{color:#6c7c94;font-size:10px;line-height:1.5}
    .beno-welcome-close{all:initial;box-sizing:border-box;pointer-events:auto;display:grid;place-items:center;flex:0 0 30px;width:30px;height:30px;border:1px solid #e3eaf4;border-radius:10px;background:#fff;color:#64748b;cursor:pointer;font:500 20px/1 system-ui,sans-serif}
    .beno-welcome-copy{display:block;margin:12px 0 13px;color:#425570;font-size:12px;line-height:1.85}
    .beno-welcome-copy strong{color:#172b4a;font-weight:800}
    .beno-welcome-actions{display:flex;align-items:center;gap:8px}
    .beno-welcome-start{all:initial;box-sizing:border-box;pointer-events:auto;flex:1;min-height:40px;display:flex;justify-content:center;align-items:center;gap:7px;padding:0 13px;border:1px solid rgba(255,255,255,.4);border-radius:12px;background:linear-gradient(135deg,var(--beno-widget-accent,#2864e8),#1c4aab);box-shadow:0 7px 16px rgba(40,100,232,.19);color:#fff;cursor:pointer;font:800 12px/1.3 system-ui,sans-serif;transition:transform .18s ease,box-shadow .18s ease}
    .beno-welcome-start:hover{transform:translateY(-1px);box-shadow:0 10px 22px rgba(40,100,232,.26)}
    .beno-welcome-later{all:initial;box-sizing:border-box;pointer-events:auto;min-height:40px;padding:0 12px;border:1px solid #e2e9f2;border-radius:12px;background:rgba(255,255,255,.8);color:#596b85;cursor:pointer;text-align:center;font:650 11px/1.3 system-ui,sans-serif}
    .beno-welcome-foot{display:flex;align-items:center;gap:6px;margin-top:10px;color:#8190a6;font-size:9px;line-height:1.5}
    .beno-welcome-foot i{display:block;flex:0 0 6px;width:6px;height:6px;border-radius:50%;background:#20b981}
    @keyframes beno-welcome-enter{from{opacity:0;transform:translateY(9px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
    @media(max-width:480px){.beno-launcher{bottom:calc(12px + env(safe-area-inset-bottom,0px));${side}:12px;min-width:208px;height:62px;padding:7px 11px 7px 9px;border-radius:19px;gap:9px}.launcher-mark{flex-basis:40px;width:40px;height:40px;border-radius:13px;font-size:21px}.launcher-copy strong{font-size:14px}.launcher-copy small{font-size:9px}.launcher-arrow{width:25px;height:25px;flex-basis:25px}.beno-launcher.is-compact{width:58px;min-width:58px;height:58px;padding:7px}.beno-launcher.is-compact .launcher-mark{flex-basis:41px;width:41px;height:41px}.beno-welcome-toast{bottom:calc(84px + env(safe-area-inset-bottom,0px));${side}:12px;width:calc(100vw - 24px);max-height:calc(100dvh - 102px);padding:14px 13px 12px;border-radius:18px}.beno-welcome-toast:after{${side}:25px}.beno-welcome-avatar{width:38px;height:38px;flex-basis:38px;border-radius:12px;font-size:20px}.beno-welcome-title strong{font-size:13px}.beno-welcome-copy{font-size:11px;margin:10px 0 11px}.beno-welcome-start,.beno-welcome-later{min-height:38px}}
    @media(max-width:350px){.beno-launcher{min-width:196px;${side}:8px}.beno-welcome-toast{${side}:8px;width:calc(100vw - 16px);padding:12px}}
    @media(prefers-reduced-motion:reduce){.beno-launcher,.beno-launcher:before,.beno-welcome-start{transition:none}.beno-welcome-toast{animation:none}}
  `;
  var button = d.createElement('button');
  button.type = 'button';
  button.className = 'beno-launcher';
  button.setAttribute('aria-label', 'افتح Beno، مهندس التسعير الذكي');
  button.setAttribute('aria-haspopup', 'dialog');
  button.innerHTML = '<span class="launcher-mark" aria-hidden="true">B<i class="launcher-status"></i></span><span class="launcher-copy"><strong>Beno</strong><small>مساعد التسعير الهندسي</small></span><span class="launcher-arrow" aria-hidden="true">↗</span>';

  var welcome = d.createElement('section');
  welcome.className = 'beno-welcome-toast';
  welcome.hidden = true;
  welcome.setAttribute('role', 'region');
  welcome.setAttribute('aria-label', 'رسالة ترحيب من Beno');
  welcome.setAttribute('aria-live', 'polite');
  welcome.innerHTML = '<div class="beno-welcome-head"><span class="beno-welcome-avatar" aria-hidden="true">B</span><div class="beno-welcome-title"><strong>أهلاً بيك في SKYPIEA 👋</strong><small>أنا Beno، مساعد التسعير الهندسي</small></div><button type="button" class="beno-welcome-close" aria-label="إغلاق رسالة ترحيب Beno">×</button></div><p class="beno-welcome-copy">أساعدك في <strong>تقدير تكلفة البناء</strong> وتنظيم بنود المقايسة وتوضيح نواقص الكميات والأسعار — من غير تخمين.</p><div class="beno-welcome-actions"><button type="button" class="beno-welcome-start">جرّب Beno <span aria-hidden="true">←</span></button><button type="button" class="beno-welcome-later">مش دلوقتي</button></div><div class="beno-welcome-foot"><i aria-hidden="true"></i><span>اسأل بطريقتك، وابدأ من غير خطوات إجبارية</span></div>';
  var welcomeClose = welcome.querySelector('.beno-welcome-close');
  var welcomeStart = welcome.querySelector('.beno-welcome-start');
  var welcomeLater = welcome.querySelector('.beno-welcome-later');
  var welcomeCopy = welcome.querySelector('.beno-welcome-copy');
  shadow.append(style, welcome, button);
  d.documentElement.appendChild(host);

  var opened = false, chunkLoading = null, mounted = false, api = {};
  var STORAGE = 'beno-chat:v1:';
  var SESSION_KEY = 'beno-chat:v1:welcome-seen';
  var welcomeTimer = null;
  var welcomeSeenMemory = false;
  function storageGet(key) { try { return w.localStorage.getItem(STORAGE + key); } catch (_) { return null; } }
  function storageSet(key, value) { try { w.localStorage.setItem(STORAGE + key, value); } catch (_) {} }
  function sessionSeen() { try { return w.sessionStorage.getItem(SESSION_KEY) === '1'; } catch (_) { return welcomeSeenMemory; } }
  function markWelcomeSeen() { welcomeSeenMemory = true; try { w.sessionStorage.setItem(SESSION_KEY, '1'); } catch (_) {} }
  function typingOnPage() {
    var a = d.activeElement;
    return !!(a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable));
  }
  function hideWelcome(markSeen) {
    if (welcomeTimer) { w.clearTimeout(welcomeTimer); welcomeTimer = null; }
    if (!welcome.hidden) welcome.hidden = true;
    if (markSeen) markWelcomeSeen();
  }
  function displayWelcome() {
    if (!config.welcomeEnabled || opened || button.hidden || sessionSeen() || d.visibilityState === 'hidden' || w.scrollY > 120) return false;
    if (typingOnPage()) return false;
    welcome.hidden = false;
    markWelcomeSeen();
    return true;
  }
  function scheduleWelcome(delay) {
    if (!config.welcomeEnabled || opened || button.hidden || sessionSeen() || welcomeTimer) return;
    welcomeTimer = w.setTimeout(function () {
      welcomeTimer = null;
      if (!displayWelcome() && !sessionSeen() && !opened && !button.hidden && config.welcomeEnabled) {
        // The visitor is typing or the tab is hidden; retry only when the page is active.
      }
    }, typeof delay === 'number' ? delay : 1750);
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
    hideWelcome(true);
    loadChunk().then(function (ok) {
      if (!ok) { opened = false; button.setAttribute('aria-label', 'تعذر تحميل الشات. اضغط لإعادة المحاولة'); return; }
      if (typeof api._open === 'function') api._open(reason || 'manual');
      button.hidden = true;
    });
  };
  api.close = function () { if (typeof api._close === 'function') api._close(); opened = false; button.hidden = false; hideWelcome(true); storageSet('closedAt', String(Date.now())); };
  api.configure = function (options) { if (!options || typeof options !== 'object') return; ['brand','accent','logo','whatsapp','api','dir','position','theme'].forEach(function(k){if(typeof options[k]==='string')config[k]=options[k];}); };
  api._register = function (handlers) { handlers=handlers||{};api._open=handlers.open;api._close=handlers.close;api._config=config;api._host=host;api._shadow=shadow;api._button=button;api._welcome=welcome;api._storage={get:storageGet,set:storageSet}; };
  api._register({});
  w.BenoChat = api;
  button.addEventListener('click', function () { hideWelcome(true); api.open('manual'); });
  welcomeClose.addEventListener('click', function () { hideWelcome(true); button.focus({ preventScroll: true }); });
  welcomeLater.addEventListener('click', function () { hideWelcome(true); button.focus({ preventScroll: true }); });
  welcomeStart.addEventListener('click', function () { hideWelcome(true); api.open('welcome'); });
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
  scheduleWelcome(1900);
  function scrollTry() { if (fired) return; var max = d.documentElement.scrollHeight - w.innerHeight; if (max > 0 && (w.scrollY / max) >= .35) { autoTry(); if (fired) w.removeEventListener('scroll', scrollTry); } }
  w.addEventListener('scroll', function () {
    if (w.scrollY > 120) {
      button.classList.add('is-compact');
      if (!sessionSeen()) hideWelcome(true);
    } else {
      button.classList.remove('is-compact');
    }
    scrollTry();
  }, { passive: true });
  d.addEventListener('focusout', function () { if (!sessionSeen() && !opened) scheduleWelcome(450); if (!fired) autoTry(); }, true);
  d.addEventListener('visibilitychange', function () {
    if (d.visibilityState === 'visible' && !sessionSeen() && !opened) scheduleWelcome(500);
    if (d.visibilityState === 'visible' && !fired) { /* preserve the 4 second/scroll contract without hidden-tab surprise */ }
  });
})(window, document);
