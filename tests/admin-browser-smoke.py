#!/usr/bin/env python3
"""Chromium UI smoke for admin layout/interactions. Real API/security are covered by admin.test.cjs."""
from __future__ import annotations
import json
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
ART=ROOT/'tests'/'artifacts'; ART.mkdir(parents=True,exist_ok=True)

def main():
    html=(ROOT/'admin.html').read_text()
    css=(ROOT/'admin.css').read_text()
    js=(ROOT/'admin.js').read_text()
    book=json.loads((ROOT/'api'/'_data'/'price-book.v1.json').read_text())
    rate_defs=json.loads(subprocess.check_output(['node','-e', "const r=require('./engines/miyar-rates.js'); process.stdout.write(JSON.stringify(Object.entries(r.defaults).map(([key,value])=>({key,...value}))))"], cwd=ROOT, text=True))
    waste_defs=json.loads(subprocess.check_output(['node','-e', "const w=require('./engines/miyar-boq-methodology.js'); process.stdout.write(JSON.stringify(w.WASTE_DEFINITIONS))"], cwd=ROOT, text=True))
    html=html.replace('<link rel="preconnect" href="https://fonts.googleapis.com" />','').replace('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />','')
    html=html.replace('<link href="https://fonts.googleapis.com/css2?family=Alexandria:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />','')
    html=html.replace('<link rel="stylesheet" href="/admin.css" />',f'<style>{css}</style>')
    html=html.replace('<script src="/admin.js" defer></script>','')
    fake=r'''<script>
      window.__adminTest={authenticated:false,book:__BOOK__,versions:[{version:'v1',published_at:new Date().toISOString(),published_by:'smoke-test',coverage_percent:39,active_items:146,priced_items:57}],published:{version:'v1',publishedAt:new Date().toISOString(),publishedBy:'smoke-test',stats:{active:146,priced:57,missing:89,coveragePercent:39}}};
      window.fetch=async function(url,options={}){
        const method=options.method||'GET';let body={};try{body=options.body?JSON.parse(options.body):{};}catch{}
        const payload=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
        const s=window.__adminTest;
        const covered=doc=>{const a=doc.prices.filter(p=>p.active!==false),p=a.filter(x=>x.status!=='missing'&&x.avg!=null&&Number(x.avg)>0);return {active:a.length,priced:p.length,missing:a.length-p.length,coveragePercent:a.length?Math.round(p.length/a.length*1000)/10:0};};
        if(String(url).endsWith('/api/admin/session')&&method==='GET')return payload({ok:true,configured:true,authenticated:s.authenticated});
        if(String(url).endsWith('/api/admin/session')&&method==='POST'){if(body.action==='logout'){s.authenticated=false;return payload({ok:true,authenticated:false});}if(body.password!=='browser-test-password-2026')return payload({ok:false,error:'كلمة المرور غير صحيحة.'},401);s.authenticated=true;return payload({ok:true,authenticated:true});}
        if(!s.authenticated)return payload({ok:false,error:'انتهت الجلسة.'},401);
        if(String(url).endsWith('/api/admin/price-book')&&method==='GET')return payload({ok:true,draft:s.book,published:s.published,draftStats:covered(s.book),updatedAt:new Date().toISOString(),updatedBy:'smoke-test',versions:s.versions,rateDefinitions:__RATES__,wasteDefinitions:__WASTE__});
        if(String(url).endsWith('/api/admin/price-book')&&method==='PUT'){s.book=body.book;return payload({ok:true,message:'saved',draftStats:covered(s.book),updatedAt:new Date().toISOString()});}
        if(String(url).endsWith('/api/admin/publish')&&method==='POST'){const c=covered(s.book),min=Number(s.book.settings.minCoverage||.7)*100;if(c.coveragePercent<min)return payload({ok:false,error:'التغطية أقل من الحد.'},409);const n=Number(String(s.published.version).replace(/\D/g,''))+1;s.book.priceBookVersion='v'+n;s.book.version='v'+n;s.published={version:'v'+n,publishedAt:new Date().toISOString(),publishedBy:'smoke-test',stats:c};s.versions.unshift({version:'v'+n,published_at:s.published.publishedAt,published_by:'smoke-test',coverage_percent:c.coveragePercent,active_items:c.active,priced_items:c.priced});return payload({ok:true,message:'تم النشر',version:'v'+n,publishedAt:s.published.publishedAt,stats:c});}
        return payload({ok:false,error:'Not found'},404);
      };
    </script>'''.replace('__BOOK__',json.dumps(book,ensure_ascii=False,separators=(',',':'))).replace('__RATES__',json.dumps(rate_defs,ensure_ascii=False,separators=(',',':'))).replace('__WASTE__',json.dumps(waste_defs,ensure_ascii=False,separators=(',',':')))
    html=html.replace('</body>',fake+f'<script>{js}</script></body>')
    errors=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
        context=browser.new_context(viewport={'width':1440,'height':1100},reduced_motion='reduce')
        page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
        page.set_content(html,wait_until='load')
        page.get_by_text('إدارة Beno',exact=True).wait_for(timeout=5000)
        assert page.locator('#loginView').is_visible()
        page.locator('#adminPassword').fill('browser-test-password-2026');page.locator('#loginForm button[type=submit]').click()
        page.locator('#dashboardView').wait_for(state='visible',timeout=5000)
        page.wait_for_function("document.querySelectorAll('.price-card').length > 0")
        assert page.locator('#activeCount').inner_text()=='146'
        assert page.locator('[data-waste-key="tile"]').count()==1
        page.locator('[data-waste-key="tile"]').fill('8')
        page.locator('[data-waste-key="tile"]').dispatch_event('change')
        page.locator('#saveDraftBtn').click()
        page.wait_for_function("window.__adminTest.book.settings.boqWastePercentages.tile === 8", timeout=5000)
        page.locator('[data-rate-key="steelKgPerM2"][data-rate-field="value"]').fill('82')
        assert page.locator('#rateList .rate-card').count() == len(rate_defs)
        page.locator('#saveDraftBtn').click()
        page.wait_for_function("window.__adminTest.book.settings.resourceRates.steelKgPerM2.value === 82", timeout=5000)
        page.locator('#settingSteelFactor').fill('0.09')
        page.locator('#saveDraftBtn').click()
        page.wait_for_function("window.__adminTest.book.settings.resourceRates.steelKgPerM2.value === 90 && window.__adminTest.book.settings.steelFactor === 0.09", timeout=5000)
        assert page.locator('[data-rate-key="steelKgPerM2"][data-rate-field="value"]').input_value() == '90'
        page.screenshot(path=str(ART/'admin-dashboard-desktop.png'),full_page=True,animations='disabled')
        page.locator('#searchInput').fill('أسمنت السويس');page.locator('.price-card').first.wait_for(timeout=3000);assert page.locator('.price-card').count()==1
        page.locator('[data-field="avg"]').first.fill('3900');page.locator('[data-field="avg"]').first.dispatch_event('change')
        page.locator('#settingCoverage').fill('30');page.locator('#settingCoverage').dispatch_event('input')
        page.once('dialog',lambda dialog:dialog.accept());page.locator('#publishBtn').click()
        page.wait_for_function("document.querySelector('#publishedVersion').textContent==='v2'",timeout=5000)
        page.locator('#toast').evaluate("el => el.classList.add('hidden')")
        page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(ART/'admin-dashboard-mobile.png'),full_page=True,animations='disabled')
        assert not errors,'\n'.join(errors)
        print(json.dumps({'ok':True,'dashboardLoaded':True,'priceRows':146,'searchFilter':True,'priceEditAndPublish':True,'resourceRateEdit':True,'legacyRateSync':True,'wasteRateEdit':True,'wasteDefinitions':len(waste_defs),'rateDefinitions':len(rate_defs),'publishedVersion':page.locator('#publishedVersion').inner_text(),'consoleErrors':errors,'apiMode':'UI mock; real server/API path tested in tests/admin.test.cjs','screenshots':['tests/artifacts/admin-dashboard-desktop.png','tests/artifacts/admin-dashboard-mobile.png']},ensure_ascii=False,indent=2))
        browser.close()
if __name__=='__main__':main()
