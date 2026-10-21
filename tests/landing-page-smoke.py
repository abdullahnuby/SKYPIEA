#!/usr/bin/env python3
"""Responsive and interaction smoke for the public Beno marketing landing page."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, re

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://beno-landing.invalid'


def build_html():
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    css = (ROOT / 'styles.css').read_text(encoding='utf-8')
    app = (ROOT / 'app.js').read_text(encoding='utf-8')
    loader = (ROOT / 'widget/src/loader.js').read_text(encoding='utf-8')
    html = html.replace('<link rel="stylesheet" href="./styles.css" />', '<style>' + css + '</style>')
    html = html.replace('<script src="./app.js" defer></script>', '<script>' + app + '</script>')
    html = html.replace('<link rel="icon" type="image/svg+xml" href="./favicon.svg" />', '')
    tag = re.search(r'<script src="/beno-chat\.js"[^>]*></script>', html)
    if not tag:
        raise RuntimeError('Beno loader tag is missing from index.html')
    html = html.replace(tag.group(0), '')
    loader = loader.replace(
        "chunkUrl: src.replace(/beno-chat\\.js(?:\\?.*)?$/, 'beno-chat.chunk.js')",
        "chunkUrl: '" + ORIGIN + "/beno-chat.chunk.js'"
    )
    if "chunkUrl: '" + ORIGIN + "/beno-chat.chunk.js'" not in loader:
        raise RuntimeError('Could not set synthetic widget chunk origin')
    html = html.replace('</body>', '<script>' + loader + '</script></body>')
    return html


def main():
    html = build_html()
    results = {'viewports': {}, 'consoleErrors': [], 'landingCtas': None, 'chatUsesBenoBrand': False, 'promptPrefillWorks': False, 'autoOpenDisabled': True}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
        for width, height, label in [(390, 844, 'mobile'), (1440, 1000, 'desktop')]:
            page = browser.new_page(viewport={'width': width, 'height': height}, color_scheme='light')
            errors = []
            page.on('pageerror', lambda error, bag=errors: bag.append(str(error)))
            page.route('https://fonts.googleapis.com/**', lambda route: route.abort())
            page.route('https://fonts.gstatic.com/**', lambda route: route.abort())
            page.route(ORIGIN + '/beno-chat.chunk.js', lambda route: route.fulfill(status=200, content_type='application/javascript', body=(ROOT / 'beno-chat.chunk.js').read_text(encoding='utf-8')))
            page.set_content(html, wait_until='load')
            page.wait_for_timeout(100)
            assert page.title().startswith('Beno |'), page.title()
            assert page.locator('[data-beno-open]').count() >= 14
            results['landingCtas'] = page.locator('[data-beno-open]').count()
            results['autoOpenDisabled'] = page.locator('.beno-panel').count() == 0
            assert page.locator('body').evaluate('(node) => node.scrollWidth') <= width, f'horizontal overflow at {label}'
            visible_text = page.locator('body').inner_text()
            assert 'Beno' in visible_text
            assert 'بينو' not in visible_text
            assert page.locator('button.beno-launcher').count() == 1
            assert page.locator('.beno-panel').count() == 0, 'chat should stay closed until the visitor chooses to open it'
            results['viewports'][label] = {
                'title': page.title(),
                'ctaCount': page.locator('[data-beno-open]').count(),
                'bodyHeight': page.locator('body').evaluate('(node) => node.scrollHeight'),
                'horizontalOverflow': False,
                'chatInitiallyClosed': True,
                'pageErrors': errors,
            }
            # Contextual prompt card opens the same conversation and pre-fills the composer without auto-sending.
            page.locator('[data-beno-open="prompt-apartment"]').click()
            page.locator('.beno-panel').wait_for(state='visible', timeout=5000)
            field = page.locator('.beno-composer .beno-text-input')
            field.wait_for(state='visible', timeout=3000)
            assert 'شقة' in field.input_value(), f'context prompt not prefilled: {field.input_value()}'
            assert page.locator('.beno-user').count() == 0, 'starter prompt must not submit automatically'
            assert page.locator('.beno-header-title strong').inner_text() == 'Beno'
            results['chatUsesBenoBrand'] = True
            results['promptPrefillWorks'] = True
            results['viewports'][label]['promptPrefillWorks'] = True
            results['viewports'][label]['chatBrand'] = page.locator('.beno-header-title strong').inner_text()
            assert not errors, f'page errors at {label}: {errors}'
            page.close()
        browser.close()
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
