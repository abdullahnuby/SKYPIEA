/* Include this small helper in the existing BENO admin dashboard; it does not replace the dashboard. */
(function(){'use strict';
  function makeExport(){
    const source=window.BENO_ADMIN_STATE || window.BENO_STATE || window.BENO_APP_STATE || window.MIYAR_ADMIN_STATE || window.MIYAR_STATE || window.MIYAR_APP_STATE;
    if(!source || !Array.isArray(source.prices)) throw new Error('لم أجد مصدر الأسعار في ذاكرة لوحة الإدارة. اربط getAdminPriceBook() بمصدر البيانات الحالي قبل استخدام التصدير.');
    const settings=source.settings || {};
    const payload={app:'BENO by Skypiea — Price Book',version:new Date().toISOString().slice(0,10),exportedAt:new Date().toISOString(),settings:JSON.parse(JSON.stringify(settings)),prices:JSON.parse(JSON.stringify(source.prices))};
    return new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});
  }
  function install(){
    if(document.getElementById('benoPriceBookExport')) return;
    const existing=document.querySelector('#exportJsonBtn');
    const host=existing?.parentElement || document.querySelector('[data-admin-actions]') || document.body;
    const button=document.createElement('button');button.id='benoPriceBookExport';button.type='button';button.textContent='تصدير ملف الأسعار (إصدار)';button.className=existing?.className||'';button.style.marginInlineStart='8px';
    button.addEventListener('click',function(){try{const blob=makeExport();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`beno-price-book-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){alert(e.message||'تعذر تصدير الأسعار');}});
    host.appendChild(button);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.BenoPriceBookExport={makeExport:makeExport,refresh:install};
})();
