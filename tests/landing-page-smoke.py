#!/usr/bin/env python3
"""Responsive acceptance tests for the SKYPIEA company landing page with Beno featured as one product."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, re

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://skypiea-landing.invalid'


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
    html = html.replace('</body>', '<script data-api="/" data-brand="Beno" data-accent="#2864e8" data-dir="rtl" data-position="right" data-theme="auto" data-autoopen="false" data-welcome="true">' + loader + '</script></body>')
    return html


def main():
    html = build_html()
    results = {'viewports': {}, 'consoleErrors': [], 'companySectionsRetained': False, 'benoFeaturedAsProduct': False, 'chatUsesBenoBrand': False, 'promptPrefillWorks': False, 'autoOpenDisabled': True, 'welcomeMessageWorks': False}
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
            assert page.title().startswith('SKYPIEA |'), page.title()
            # The compact widget greets the visitor, but must not take over the page or auto-open the chat.
            welcome = page.locator('.beno-welcome-toast')
            welcome.wait_for(state='visible', timeout=3500)
            welcome_text = welcome.inner_text()
            assert 'أهلاً بيك في SKYPIEA' in welcome_text
            assert 'Beno' in welcome_text and 'مساعد التسعير الهندسي' in welcome_text
            assert page.locator('.beno-panel').count() == 0, 'welcome toast must not auto-open the chat panel'
            assert page.locator('button.beno-launcher').is_visible()
            assert page.locator('body').evaluate('(node) => node.scrollWidth') <= width, f'widget caused horizontal overflow while welcome is visible at {label}'
            if label == 'desktop':
                welcome.locator('.beno-welcome-start').click()
                page.locator('.beno-panel').wait_for(state='visible', timeout=5000)
                assert welcome.is_hidden(), 'welcome toast must close when the visitor opens Beno'
                page.get_by_role('button', name='إغلاق Beno').click()
                page.locator('.beno-panel').wait_for(state='hidden', timeout=3000)
                results['welcomeStartOpensChat'] = True
            else:
                welcome.locator('.beno-welcome-later').click()
                assert welcome.is_hidden(), 'Not now should dismiss the welcome message'
                assert not page.locator('.beno-panel').is_visible(), 'dismissing welcome must not open chat'
                results['welcomeCanBeDismissed'] = True
            results['welcomeMessageWorks'] = True
            visible_text = page.locator('body').inner_text()
            assert 'SKYPIEA' in visible_text
            assert 'Beno' in visible_text
            assert 'بينو' not in visible_text
            for section in ['#home', '#sectors', '#services', '#approach', '#about', '#contact', '#beno']:
                assert page.locator(section).count() == 1, f'missing company/product section {section}'
            assert page.locator('.sector-card--engineering').is_visible()
            assert page.locator('.sector-card--technology').is_visible()
            assert page.locator('#about').inner_text().strip()
            assert page.locator('#contact-form').is_visible()
            assert page.locator('#beno .beno-feature-copy').is_visible()
            assert 'مساعد التسعير الهندسي' in page.locator('#beno').inner_text() or 'engineering cost assistant' in page.locator('#beno').inner_text().lower()
            # Company identity and all core sections must survive language switching.
            page.locator('[data-language]').first.evaluate('(element) => element.click()')
            assert page.title().startswith('SKYPIEA | Engineering'), page.title()
            english_body = page.locator('body').inner_text()
            assert 'Engineering' in english_body and 'Technology' in english_body and 'Beno' in english_body
            assert 'About' in page.locator('#about').inner_text()
            assert 'Contact' in page.locator('#contact').inner_text()
            page.locator('[data-language]').first.evaluate('(element) => element.click()')
            assert page.title().startswith('SKYPIEA | حلول'), page.title()
            assert page.locator('button.beno-launcher').count() == 1
            assert not page.locator('.beno-panel').is_visible(), 'Beno should stay closed until the visitor chooses to open it'
            assert page.locator('body').evaluate('(node) => node.scrollWidth') <= width, f'horizontal overflow at {label}'
            # Switch to Technology and ensure Beno is also discoverable among ordinary company services.
            page.locator('[data-sector-tab="technology"]').click()
            assert page.locator('#service-grid .service-card').count() == 4
            beno_service = page.locator('#service-grid .service-card--beno')
            assert beno_service.is_visible()
            results['companySectionsRetained'] = True
            results['benoFeaturedAsProduct'] = True
            # The Beno card is rendered dynamically when the Technology tab is selected; its CTA must be bound too.
            beno_service.locator('[data-beno-open="service-card"]').click()
            page.locator('.beno-panel').wait_for(state='visible', timeout=5000)
            service_field = page.locator('.beno-composer .beno-text-input')
            service_field.wait_for(state='visible', timeout=3000)
            assert 'Beno' in service_field.input_value(), f'technology service prompt not prefilled: {service_field.input_value()}'
            page.get_by_role('button', name='إغلاق Beno').click()
            page.locator('.beno-panel').wait_for(state='hidden', timeout=3000)
            assert page.locator('button.beno-launcher').is_visible()
            # The dedicated product spotlight opens the same assistant and prepares its own contextual prompt.
            page.locator('[data-beno-open="company-feature"]').click()
            page.locator('.beno-panel').wait_for(state='visible', timeout=5000)
            field = page.locator('.beno-composer .beno-text-input')
            field.wait_for(state='visible', timeout=3000)
            assert 'Beno' in field.input_value(), f'context prompt not prefilled: {field.input_value()}'
            assert page.locator('.beno-user').count() == 0, 'starter prompt must not submit automatically'
            assert page.locator('.beno-header-title strong').inner_text() == 'Beno'
            results['chatUsesBenoBrand'] = True
            results['promptPrefillWorks'] = True
            results['viewports'][label] = {
                'title': page.title(), 'companySectionsRetained': True,
                'serviceCardCountTechnology': page.locator('#service-grid .service-card').count(),
                'benoCtaCount': page.locator('[data-beno-open]').count(),
                'horizontalOverflow': False, 'chatInitiallyClosed': True,
                'promptPrefillWorks': True, 'welcomeMessageWorks': True, 'welcomeToastDoesNotAutoOpenPanel': True, 'pageErrors': errors
            }
            assert not errors, f'page errors at {label}: {errors}'
            page.close()
        browser.close()
    report_path = ROOT / 'tests' / 'artifacts' / 'landing-page-smoke-report.json'
    report_path.write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
