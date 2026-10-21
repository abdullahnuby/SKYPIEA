#!/usr/bin/env python3
"""Chromium widget acceptance smoke using set_content because this runner blocks localhost/file navigation.
The widget/API remain real: Playwright intercepts a synthetic origin and a Python bridge forwards API calls
into the local Node server. Screenshots are written to tests/artifacts/.
"""
from __future__ import annotations
import json, os, socket, subprocess, time, shutil, re, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'tests' / 'artifacts'
ART.mkdir(parents=True, exist_ok=True)
TEST_ORIGIN = 'https://beno-test.invalid'

def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]

def click_button(page, name, timeout=7000):
    locator=page.get_by_role('button', name=name, exact=True).last
    try:
        locator.wait_for(state='visible', timeout=timeout)
        locator.click(timeout=timeout)
    except Exception:
        try:
            print('button-debug', name, 'messages=', page.locator('.beno-messages').inner_text()[-2500:])
            print('button-debug labels=', page.locator('button').all_text_contents()[-50:])
        except Exception:
            pass
        raise

def embed_html(auto_open=False, api=TEST_ORIGIN, mock_window_open=False):
    html=(ROOT/'examples/landing-demo.html').read_text()
    html=re.sub(r'<script src="/beno-chat\.js"[^>]*></script>', '', html)
    loader=(ROOT/'beno-chat.js').read_text()
    old="chunkUrl: src.replace(/beno-chat\\.js(?:\\?.*)?$/, 'beno-chat.chunk.js')"
    if old not in loader: raise RuntimeError('Cannot install synthetic chunk origin into built loader.')
    loader=loader.replace(old, "chunkUrl: '"+TEST_ORIGIN+"/beno-chat.chunk.js'")
    tag=(f'<script data-api="{api}" data-brand="بينو" data-accent="#156e68" '
         f'data-whatsapp="201000000000" data-dir="rtl" data-position="left" '
         f'data-autoopen="{str(auto_open).lower()}">{loader}</script>')
    shim = ('<script>window.__benoOpenUrls=[];window.open=function(){var h={};var l={};Object.defineProperty(l,"href",{set:function(v){window.__benoOpenUrls.push(String(v));},get:function(){return "";}});Object.defineProperty(h,"location",{get:function(){return l;},set:function(v){window.__benoOpenUrls.push(String(v));}});return h;};</script>' if mock_window_open else '')
    return html.replace('</body>',shim+tag+'</body>')

def main():
    port=free_port(); env=os.environ.copy();env['PORT']=str(port);env['BENO_LOCAL_DEMO']='1'
    server=subprocess.Popen([shutil.which('node') or 'node','scripts/local-server.cjs'],cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,text=True)
    local=f'http://127.0.0.1:{port}'
    try:
        deadline=time.time()+12
        while time.time()<deadline:
            try:
                with socket.create_connection(('127.0.0.1',port),timeout=.3): break
            except OSError: time.sleep(.1)
        else: raise RuntimeError('local server did not start')
        output={'viewports':{},'consoleErrors':[],'apiRequestsBeforeOpen':0,'hostCssUnchanged':True,'layoutShift':None,'autoOpen':False,'autoOpenSuppressedWhileTyping':False,'leadRoundTrip':False,'fallback':False,'focusAndEscape':False,'executionMode':'Chromium set_content + intercepted synthetic origin; real local Node API'}
        api_calls=[]
        def bridge(route):
            req=route.request; path=req.url.split('beno-test.invalid')[-1]
            if req.method=='OPTIONS':
                route.fulfill(status=204,body='',headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, X-Beno-Session','Access-Control-Allow-Methods':'POST, OPTIONS'});return
            if path=='/beno-chat.chunk.js':
                route.fulfill(status=200,content_type='application/javascript',body=(ROOT/'beno-chat.chunk.js').read_text(),headers={'Access-Control-Allow-Origin':'*'});return
            api_calls.append((req.method,path))
            body=req.post_data.encode() if req.post_data else None
            request=urllib.request.Request(local+path,data=body,headers={'Content-Type':'application/json','X-Beno-Session':req.headers.get('x-beno-session','browser-smoke')},method=req.method)
            try:
                with urllib.request.urlopen(request,timeout=8) as response:
                    raw=response.read();status=response.status;ctype=response.headers.get('Content-Type','application/json; charset=utf-8')
            except urllib.error.HTTPError as e:
                raw=e.read();status=e.code;ctype=e.headers.get('Content-Type','application/json; charset=utf-8')
            except Exception as e:
                raw=json.dumps({'ok':False,'error':str(e)},ensure_ascii=False).encode();status=502;ctype='application/json; charset=utf-8'
            route.fulfill(status=status,body=raw,headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, X-Beno-Session','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':ctype})

        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
            for width,scheme in [(375,'light'),(1440,'light'),(375,'dark'),(1440,'dark')]:
                label=('mobile' if width<600 else 'desktop')+'-'+scheme
                context=browser.new_context(viewport={'width':width,'height':812 if width<600 else 1000},color_scheme=scheme,reduced_motion='no-preference',is_mobile=width<600,has_touch=width<600)
                page=context.new_page(); errors=[]; requests=[]
                page.on('console',lambda msg,arr=errors: arr.append(msg.text) if msg.type=='error' else None)
                page.on('pageerror',lambda err,arr=errors: arr.append('PAGEERROR: '+str(err)))
                page.on('request',lambda req,arr=requests: arr.append(req.url))
                page.route(TEST_ORIGIN+'/**',bridge)
                page.set_content((ROOT/'examples/landing-demo.html').read_text().replace(re.search(r'<script src="/beno-chat\.js"[^>]*></script>',(ROOT/'examples/landing-demo.html').read_text()).group(0),''),wait_until='load')
                page.wait_for_timeout(100)
                host_before=page.locator('.hero .cta').evaluate("e=>{const s=getComputedStyle(e);return {display:s.display,color:s.color,fontSize:s.fontSize,position:s.position,margin:s.margin,padding:s.padding,background:s.backgroundColor,transform:s.transform}}")
                page.screenshot(path=str(ART/f'{label}-00-host-before-widget.png'),full_page=False,animations='disabled')
                calls_before=len(api_calls)
                page.set_content(embed_html(False),wait_until='load')
                page.wait_for_timeout(200)
                host_after=page.locator('.hero .cta').evaluate("e=>{const s=getComputedStyle(e);return {display:s.display,color:s.color,fontSize:s.fontSize,position:s.position,margin:s.margin,padding:s.padding,background:s.backgroundColor,transform:s.transform}}")
                assert host_before==host_after, f'host CSS changed for {label}'
                assert len(api_calls)==calls_before, f'API request before open for {label}: {api_calls[calls_before:]}'
                launcher=page.locator('button.beno-launcher');launcher.wait_for(state='visible',timeout=5000)
                page.screenshot(path=str(ART/f'{label}-01-launcher.png'),full_page=False,animations='disabled')
                launcher.click(timeout=5000)
                page.locator('.beno-panel').wait_for(state='visible',timeout=6000)
                page.locator('.beno-choice').first.wait_for(state='visible',timeout=4000)
                page.screenshot(path=str(ART/f'{label}-02-welcome.png'),full_page=False,animations='disabled')
                # Complete a real local API estimate using visible controls only.
                click_button(page,'عمارة / مبنى جديد')
                area=page.locator('.beno-number input[type=number]').last;area.wait_for(state='visible',timeout=5000);area.fill('180')
                page.locator('.beno-number').last.get_by_role('button',name='تأكيد',exact=True).click()
                floors=page.locator('.beno-number input[type=number]').last;floors.wait_for(state='visible',timeout=5000);floors.fill('3')
                page.locator('.beno-number').last.get_by_role('button',name='تأكيد',exact=True).click()
                click_button(page,'على المفتاح');click_button(page,'متوسط');click_button(page,'تأكيد الاختيارات');click_button(page,'احسب المقايسة')
                page.locator('.beno-gap-main').wait_for(state='visible',timeout=10000)
                assert re.search(r'تغطية الأسعار الحالية \d+%', page.locator('.beno-result').inner_text()), page.locator('.beno-result').inner_text()
                result_text=page.locator('.beno-result').inner_text()
                assert 'لسه مش هعرض رقم رئيسي' in result_text and 'أهم المجموعات التي تحتاج مراجعة' in result_text and 'بنود رئيسية' in result_text, result_text
                page.screenshot(path=str(ART/f'{label}-03-result.png'),full_page=False,animations='disabled')
                # Package clicks open a compact BOQ by default; individual resource rows are behind an expansion.
                page.locator('.beno-package-row').first.click();page.locator('.beno-sheet').wait_for(state='visible',timeout=5000)
                assert page.locator('.beno-summary-line').count()>0, 'compact BOQ did not render main work rows'
                assert not any(page.locator('.beno-doc-line').nth(i).is_visible() for i in range(page.locator('.beno-doc-line').count())), 'detailed resources should remain collapsed in the compact first view'
                page.screenshot(path=str(ART/f'{label}-04-summary-sheet.png'),full_page=False,animations='disabled')
                page.locator('.beno-summary-line-head').first.click()
                assert page.locator('.beno-doc-line').count()>0, 'expanding a main row should reveal the component lines'
                page.locator('.beno-sheet-header button').click()
                click_button(page,'فصّل لي');page.locator('.beno-sheet').wait_for(state='visible',timeout=5000)
                assert page.locator('.beno-doc-line').count()>0
                page.screenshot(path=str(ART/f'{label}-05-detail-sheet.png'),full_page=False,animations='disabled')
                # Line details are intentionally collapsed by default; open the first editable row before editing.
                cards=page.locator('.beno-doc-line')
                quantity_editor_available=False
                quantity_override_roundtrip=False
                for card_index in range(cards.count()):
                    card=cards.nth(card_index)
                    candidate=card.locator('.beno-quantity-editor')
                    if not candidate.count():
                        continue
                    quantity_editor_available=True
                    card.locator('.beno-doc-line-head').click()
                    qty_input=candidate.locator('input[type=number]')
                    current_qty=qty_input.input_value().strip()
                    if current_qty:
                        numeric_qty=float(current_qty.replace(',',''))
                        qty_input.fill(str(numeric_qty))
                        candidate.get_by_role('button',name='اعتماد الكمية وإعادة الحساب',exact=True).click()
                        page.get_by_text('اعتمدت الكمية المدخلة وأعدت حساب البنود والتكلفة المرتبطة بها.',exact=True).wait_for(timeout=12000)
                        page.locator('.beno-sheet').wait_for(state='visible',timeout=5000)
                        quantity_override_roundtrip=True
                        break
                assert quantity_override_roundtrip, 'line quantity editor did not round-trip through estimate.run'
                click_button(page,'إغلاق الورقة');click_button(page,'قارن الباقات')
                page.get_by_text('مقارنة الباقات',exact=False).last.wait_for(state='visible',timeout=8000)
                assert page.locator('.beno-compare-card').count()==4
                page.screenshot(path=str(ART/f'{label}-05-comparison.png'),full_page=False,animations='disabled')
                page.keyboard.press('Escape');launcher.wait_for(state='visible',timeout=4000);output['focusAndEscape']=True
                coverage_match=re.search(r'تغطية الأسعار الحالية (\d+)%',result_text)
                output['viewports'][label]={'hostCssUnchanged':True,'apiRequestsBeforeOpen':0,'resultCoverage':int(coverage_match.group(1)) if coverage_match else None,'mainAmountHidden':True,'sheetLines':page.locator('.beno-doc-line').count(),'quantityEditorAvailable':quantity_editor_available,'quantityOverrideRoundTrip':quantity_override_roundtrip,'comparisonCards':4,'dialogClosedByEscape':True,'consoleErrors':len(errors)}
                output['consoleErrors'].extend([label+': '+e for e in errors])
                context.close()

            # Auto-open timing and typing suppression. About:blank storage may be sandbox-restricted,
            # so we test the actual timing and active-field guards rather than persistence across navigation.
            c=browser.new_context(viewport={'width':375,'height':812},color_scheme='light');auto=c.new_page();auto.route(TEST_ORIGIN+'/**',bridge)
            auto.set_content(embed_html(True),wait_until='load');auto.wait_for_timeout(4300)
            assert auto.locator('.beno-panel').is_visible(timeout=3000);output['autoOpen']=True
            auto.screenshot(path=str(ART/'auto-open.png'),full_page=False,animations='disabled');c.close()
            c=browser.new_context(viewport={'width':375,'height':812},color_scheme='light');typing=c.new_page();typing.route(TEST_ORIGIN+'/**',bridge)
            typing.set_content(embed_html(True),wait_until='load');typing.get_by_label('اسم تجريبي').focus();typing.wait_for_timeout(4300)
            assert not typing.locator('.beno-panel').is_visible();output['autoOpenSuppressedWhileTyping']=True
            typing.get_by_label('اسم تجريبي').evaluate('(e)=>e.blur()');typing.wait_for_timeout(600)
            assert typing.locator('.beno-panel').is_visible();c.close()

            # Lead API persists into the local in-memory demo store; URL construction is captured
            # because this sandbox blocks real external navigation.
            c=browser.new_context(viewport={'width':1440,'height':1000},color_scheme='dark');lead=c.new_page();lead.route(TEST_ORIGIN+'/**',bridge)
            lead.set_content(embed_html(False,mock_window_open=True),wait_until='load');lead.locator('button.beno-launcher').click();lead.locator('.beno-panel').wait_for(state='visible')
            click_button(lead,'عمارة / مبنى جديد')
            a=lead.locator('.beno-number input[type=number]').last;a.wait_for(state='visible');a.fill('180');lead.locator('.beno-number').last.get_by_role('button',name='تأكيد',exact=True).click()
            lead.locator('.beno-number input[type=number]').last.wait_for(state='visible');f=lead.locator('.beno-number input[type=number]').last;f.fill('3');lead.locator('.beno-number').last.get_by_role('button',name='تأكيد',exact=True).click()
            click_button(lead,'على المفتاح');click_button(lead,'متوسط');click_button(lead,'تأكيد الاختيارات')
            click_button(lead,'احسب المقايسة');lead.locator('.beno-gap-main').wait_for(state='visible',timeout=10000)
            click_button(lead,'ابعت لمهندس');lead.get_by_label('الاسم',exact=True).fill('اختبار بينو');lead.get_by_label('رقم الموبايل المصري',exact=True).fill('01012345678');lead.locator('.beno-consent input').check();lead.wait_for_timeout(2700)
            click_button(lead,'حفظ البيانات وفتح واتساب',timeout=5000)
            lead.get_by_text('وصل طلبك واتحفظ برقم مرجعي',exact=False).wait_for(state='visible',timeout=7000)
            attempted=lead.evaluate('window.__benoOpenUrls||[]')
            assert any('https://wa.me/' in u for u in attempted), attempted
            output['leadRoundTrip']=True;output['whatsappUrlPrepared']=True;output['whatsappBrowserNavigation']='blocked by test sandbox; URL construction captured'
            lead.screenshot(path=str(ART/'lead-flow.png'),full_page=False,animations='disabled');c.close()

            # Unavailable server path: let the real chunk load but fail only the tool endpoint.
            c=browser.new_context(viewport={'width':375,'height':812},color_scheme='light');fail=c.new_page()
            fail.route(TEST_ORIGIN+'/**',bridge)
            def fail_api(route):
                if route.request.method=='OPTIONS': route.fulfill(status=204,body='',headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, X-Beno-Session','Access-Control-Allow-Methods':'POST, OPTIONS'})
                else: route.fulfill(status=503,content_type='application/json',body='{"ok":false,"error":"service unavailable"}',headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, X-Beno-Session','Access-Control-Allow-Methods':'POST, OPTIONS'})
            fail.route(TEST_ORIGIN+'/api/tool',fail_api)
            fail.set_content(embed_html(False),wait_until='load');fail.locator('button.beno-launcher').click();fail.locator('.beno-panel').wait_for(state='visible')
            click_button(fail,'عمارة / مبنى جديد');a=fail.locator('.beno-number input[type=number]').last;a.wait_for(state='visible');a.fill('180');fail.locator('.beno-number').last.get_by_role('button',name='تأكيد',exact=True).click()
            fail.locator('.beno-number input[type=number]').last.wait_for(state='visible');f=fail.locator('.beno-number input[type=number]').last;f.fill('3');fail.locator('.beno-number').last.get_by_role('button',name='تأكيد',exact=True).click()
            click_button(fail,'على المفتاح');click_button(fail,'متوسط');click_button(fail,'تأكيد الاختيارات');click_button(fail,'احسب المقايسة')
            fail.get_by_role('button',name='ابعت ملخص المشروع على واتساب',exact=True).wait_for(state='visible',timeout=8000)
            fallback_text=fail.locator('.beno-panel').inner_text()
            assert any(x in fallback_text for x in ['مش متاح','مشكلة اتصال','مش بيرد']), fallback_text
            assert fail.locator('.beno-result-amount').count()==0;output['fallback']=True
            fail.screenshot(path=str(ART/'server-failure-fallback.png'),full_page=False,animations='disabled');c.close()
            browser.close()
        if output['consoleErrors']: raise AssertionError('Browser console errors: '+json.dumps(output['consoleErrors'],ensure_ascii=False))
        output['apiRequestCount']=len(api_calls)
        output['layoutShift']='not measured: set_content mode avoids forbidden localhost/file navigation in this runner'
        (ART/'browser-smoke-report.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps(output,ensure_ascii=False,indent=2));print(f"Browser screenshots saved: {len(list(ART.glob('*.png')))} PNG files in {ART}")
    finally:
        server.terminate()
        try:server.wait(timeout=3)
        except subprocess.TimeoutExpired:server.kill()
if __name__=='__main__':main()
