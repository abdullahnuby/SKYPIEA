#!/usr/bin/env python3
"""Focused acceptance checks for Beno's expanded engineering-workspace chat UI."""
from __future__ import annotations
import json, re
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'tests' / 'artifacts'
ART.mkdir(parents=True, exist_ok=True)
ORIGIN = 'https://beno-workspace.invalid'

def make_embed():
    html = (ROOT / 'examples/landing-demo.html').read_text()
    html = re.sub(r'<script src="/beno-chat\.js"[^>]*></script>', '', html)
    loader = (ROOT / 'beno-chat.js').read_text()
    old = "chunkUrl: src.replace(/beno-chat\\.js(?:\\?.*)?$/, 'beno-chat.chunk.js')"
    if old not in loader:
        raise RuntimeError('Cannot configure Beno chunk for browser test.')
    loader = loader.replace(old, "chunkUrl: '" + ORIGIN + "/beno-chat.chunk.js'")
    tag = '<script data-api="/" data-brand="Beno" data-accent="#2864e8" data-dir="rtl" data-position="right" data-autoopen="false">' + loader + '</script>'
    return html.replace('</body>', tag + '</body>')

def main():
    results = {'viewports': {}, 'consoleErrors': [], 'checks': []}
    embed = make_embed()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])
        for width, height, scheme in [(1440, 960, 'light'), (390, 844, 'light'), (390, 844, 'dark')]:
            label = ('desktop' if width > 600 else 'mobile') + '-' + scheme
            context = browser.new_context(viewport={'width': width, 'height': height}, color_scheme=scheme, is_mobile=width <= 600, has_touch=width <= 600)
            page = context.new_page()
            errors = []
            page.on('console', lambda msg, arr=errors: arr.append(msg.text) if msg.type == 'error' else None)
            page.on('pageerror', lambda err, arr=errors: arr.append('PAGEERROR: ' + str(err)))
            def route_widget(route):
                path = route.request.url.split(ORIGIN)[-1]
                if path == '/beno-chat.chunk.js':
                    route.fulfill(status=200, content_type='application/javascript', body=(ROOT/'beno-chat.chunk.js').read_text(), headers={'Access-Control-Allow-Origin':'*'})
                else:
                    route.fulfill(status=204, body='')
            page.route(ORIGIN + '/**', route_widget)
            page.set_content(embed, wait_until='load')
            launcher = page.locator('button.beno-launcher')
            launcher.wait_for(state='visible', timeout=4000)
            launcher.click()
            panel = page.locator('.beno-panel')
            panel.wait_for(state='visible', timeout=5000)
            page.locator('.beno-welcome-title').wait_for(state='visible', timeout=3000)
            page.wait_for_timeout(280)  # allow the workspace entrance animation to settle before layout assertions
            assert page.locator('.beno-welcome-title').inner_text() == 'خلّينا نحسبها هندسيًا.'
            showcase = page.locator('.beno-welcome-showcase')
            assert showcase.is_visible(), 'engineering sample panel should appear in the welcome experience'
            assert 'بلا أسعار افتراضية' in showcase.inner_text(), 'the sample must be labeled as illustrative, not a real estimate'
            assert page.locator('.beno-sample-row[role=row]').count() == 4, 'sample needs a header and three example work packages'
            welcome_rect = page.locator('.beno-welcome-title').bounding_box()
            panel_rect_for_welcome = page.locator('.beno-panel').bounding_box()
            assert welcome_rect and panel_rect_for_welcome and welcome_rect['y'] < panel_rect_for_welcome['y'] + panel_rect_for_welcome['height'] * 0.4, 'welcome heading should remain near the top instead of being pushed out of view by auto-scroll'
            card_bg = page.locator('.beno-start-card').first.evaluate('(e) => getComputedStyle(e).backgroundImage')
            if scheme == 'dark':
                assert '21, 31, 49' in card_bg, f'dark start card must use a dark high-contrast surface, got {card_bg}'
            if width > 600:
                showcase_rect = showcase.bounding_box()
                messages_rect = page.locator('.beno-messages').bounding_box()
                assert showcase_rect and messages_rect and showcase_rect['y'] + showcase_rect['height'] <= messages_rect['y'] + messages_rect['height'] + 1, 'desktop welcome sample must fit above the composer without being cut off'
            page.screenshot(path=str(ART / f'beno-welcome-{label}.png'), full_page=False, animations='disabled')
            assert page.locator('.beno-start-card').count() == 3
            assert not launcher.is_visible(), 'launcher should hide while the expanded chat workspace is open'
            rect = panel.bounding_box()
            assert rect and rect['width'] >= (1000 if width > 600 else width - 2), f'workspace too small at {label}: {rect}'
            sidebar = page.locator('.beno-context-panel')
            if width > 600:
                assert sidebar.is_visible(), 'project context sidebar should remain visible on desktop'
            else:
                assert not sidebar.is_visible(), 'mobile context drawer should start closed'
                page.get_by_role('button', name='ملف المشروع').click()
                assert sidebar.is_visible(), 'project context drawer did not open on mobile'
                assert page.locator('.beno-context-toggle').get_attribute('aria-expanded') == 'true'
                page.locator('.beno-sidebar-close').click()
                assert not sidebar.is_visible(), 'project context drawer did not close'
            textarea = page.locator('.beno-composer textarea')
            textarea.fill('محتاج أراجع بند الخرسانة')
            assert page.locator('.beno-send').is_enabled(), 'send should enable when text exists'
            textarea.press('Shift+Enter')
            assert textarea.input_value().endswith('\n'), 'Shift+Enter should preserve a multiline draft'
            textarea.fill('')
            assert page.locator('.beno-send').is_disabled(), 'send should disable when composer is empty'
            # Starting a service uses the same current engine, not a visual-only mock.
            page.get_by_role('button', name='شقة تشطيب', exact=True).click()
            page.locator('.beno-number input[type=number]').wait_for(state='visible', timeout=3000)
            assert 'شقة تشطيب' in sidebar.inner_text() if width > 600 else True
            assert page.locator('.beno-messages').get_attribute('aria-busy') in ('false', None)
            page.screenshot(path=str(ART / f'beno-workspace-{label}.png'), full_page=False, animations='disabled')
            page.keyboard.press('Escape')
            assert not panel.is_visible(), 'Escape should close workspace'
            assert launcher.is_visible(), 'launcher should return when the workspace is closed'
            assert not errors, f'{label} console errors: {errors}'
            results['viewports'][label] = {'workspaceWidth': round(rect['width']), 'welcomeCards': 3, 'contextPanelResponsive': True, 'multilineComposer': True, 'sendState': 'correct', 'launcherVisibility': 'correct', 'consoleErrors': len(errors)}
            results['consoleErrors'].extend(label + ': ' + e for e in errors)
            context.close()
        browser.close()
    results['checks'] = ['expanded centered workspace on desktop', 'full-screen conversational surface on mobile', 'responsive project context panel', 'welcome starter cards wired to live service selection', 'multiline composer and send-state behavior', 'launcher hides while chat is open', 'Escape-to-close and restore launcher', 'welcome experience includes a clearly labeled illustrative engineering sample', 'welcome opens at the top instead of auto-scrolling past the heading', 'light/dark color schemes']
    (ART/'beno-workspace-smoke-report.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(results, ensure_ascii=False, indent=2))

if __name__ == '__main__': main()
