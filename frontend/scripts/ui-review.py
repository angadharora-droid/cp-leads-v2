"""Desktop UI review using synthetic API responses; never writes application data."""
import json
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.tmp' / 'ui-review'
OUT.mkdir(parents=True, exist_ok=True)
USER = {'_id': '000000000000000000000001', 'id': '000000000000000000000001', 'name': 'Review Manager', 'email': 'review@example.test', 'role': 'admin', 'modules': ['leads', 'prospectus', 'estimates'], 'isActive': True}
LEADS = [{'_id': f'{i:024}', 'reference': f'CPH-NAGPUR-180926-{i:03}', 'businessName': name, 'contactPerson': contact,
          'leadType': 'company', 'mobile': '98765 43210', 'email': f'contact{i}@example.test', 'city': 'Nagpur', 'status': 'Non-Contracted',
          'assignedTo': {'_id': USER['_id'], 'name': 'Review Manager'}, 'departments': [], 'createdAt': '2026-09-18T10:00:00Z'}
         for i, (name, contact) in enumerate([('Meridian Technologies', 'Anita Sharma'), ('Northstar Industries', 'Rahul Shah'), ('Oak & Pine Consulting', 'Neha Patel'), ('Horizon Retail Group', 'Vikram Singh'), ('Pinnacle Healthcare', 'Priya Desai'), ('Summit Infrastructure', 'Arjun Mehta')], 10)]
FP = {'_id': '000000000000000000000101', 'number': '0042', 'partyName': 'Anita Sharma', 'companyName': 'Meridian Technologies',
      'functionType': 'Annual conference', 'venue': 'Grand Ballroom', 'dateFrom': '2026-09-25', 'dateTo': '2026-09-25', 'pax': 120,
      'rate': 1200, 'status': 'draft', 'madeByName': 'Review Manager', 'lead': LEADS[0], 'createdAt': '2026-09-18', 'revision': 1, 'emails': [],
      'menu': 'Welcome refreshments\nBuffet lunch\nTea and coffee', 'contactPerson': 'Anita Sharma', 'phone': '98765 43210', 'email': 'contact@example.test'}
EST = {'_id': '000000000000000000000102', 'number': '0036', 'functionName': 'Annual conference', 'functionType': 'Conference',
       'billingName': 'Meridian Technologies', 'venue': 'Grand Ballroom', 'date': '2026-09-25', 'status': 'draft', 'guaranteedPax': 120,
       'pricePerPlate': 1200, 'madeByName': 'Review Manager', 'hallCharges': [], 'lead': LEADS[0], 'remarks': 'Standard banquet terms apply.'}

def fixture(path):
    if path == '/auth/refresh': return {'accessToken': 'ui-review-only'}
    if path == '/auth/me': return {'user': USER}
    if path == '/leads': return {'items': LEADS, 'total': len(LEADS), 'page': 1, 'limit': 20}
    if path in ['/users', '/leads/assignees']: return {'users': [USER, {**USER, '_id': '000000000000000000000002', 'name': 'Accounts Executive', 'role': 'sales_exec', 'modules': ['estimates']}]}
    if path.startswith('/follow-ups'): return {'followUps': []}
    if path.startswith('/banquet'): return {'venues': [], 'sessions': [], 'catalog': [], 'functionTypes': [], 'settings': {}}
    if path.startswith('/prospectus/') and path.split('/')[-1] == FP['_id']: return {'prospectus': FP, 'booking': {'stage': 'won', 'functionExists': True, 'contractNumber': 'HCP.EC.00042'}}
    if path.startswith('/estimates/') and path.split('/')[-1] == EST['_id']: return {'estimate': EST, 'sheet': {'exists': True, 'prospectusId': FP['_id'], 'number': FP['number']}, 'booking': {'stage': 'won'}}
    if path == '/enquiries':
        return {'enquiries': [{'_id': f'{i+200:024}', 'lead': lead, 'stage': ['enquiry', 'proposal', 'won'][i % 3], 'kind': 'banquet',
            'functions': [{'_id': f'{i+300:024}', 'name': 'Conference', 'date': '2026-09-25', 'pax': 120, 'venues': [{'name': 'Grand Ballroom'}]}], 'estimatedRevenue': 144000} for i, lead in enumerate(LEADS)]}
    if path == '/arcs': return {'arcs': []}
    if path.endswith('/overview'): return {'kpis': {'upcoming': 6, 'pending': 2, 'madeThisMonth': 12, 'emailedThisMonth': 8, 'total': 42, 'outdated': 0}, 'next': []}
    if path.endswith('/functions') or path.endswith('/confirmed'): return {'functions': []}
    if path.endswith('/sheets'): return {'sheets': []}
    if path == '/prospectus': return {'prospectuses': [FP]}
    if path == '/estimates': return {'estimates': [EST]}
    if path.endswith('/settings'): return {'recipients': [], 'settings': {}}
    return {}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
    page.add_init_script("localStorage.setItem('cph_has_session','1')")
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    def route_api(route):
        path = urlsplit(route.request.url).path.removeprefix('/api')
        route.fulfill(status=200, content_type='application/json', body=json.dumps({'success': True, 'data': fixture(path)}))
    page.route('**/api/**', route_api)
    for name, path in [('leads','/leads'), ('enquiries','/enquiries'), ('users','/users'), ('fp','/prospectus/'+FP['_id']), ('estimate','/estimates/'+EST['_id'])]:
        page.goto('http://127.0.0.1:5178'+path)
        page.wait_for_timeout(900)
        page.screenshot(path=str(OUT/f'{name}-desktop.png'), full_page=True)
        width = page.evaluate('({body: document.documentElement.scrollWidth, viewport: innerWidth})')
        assert width['body'] <= width['viewport'], (name, width)
        print(name, 'rendered without horizontal page overflow', flush=True)
    page.goto('http://127.0.0.1:5178/leads')
    page.get_by_role('button', name='Collapse sidebar', exact=True).click()
    page.get_by_role('button', name='Expand sidebar', exact=True).wait_for()
    page.reload()
    page.get_by_role('button', name='Expand sidebar', exact=True).wait_for()
    page.screenshot(path=str(OUT/'leads-compact-desktop.png'), full_page=True)
    page.get_by_role('button', name='Expand sidebar', exact=True).click()
    # Every stage must remain fully on-screen, including the closed stages.
    page.goto('http://127.0.0.1:5178/enquiries')
    page.get_by_role('list', name='Pipeline stages').wait_for()
    page.get_by_role('button', name='Show lost & cancelled', exact=True).click()
    assert page.locator('.kanban-board > section').count() == 7
    for width in [1280, 1440, 1680, 1920]:
        page.set_viewport_size({'width': width, 'height': 1000})
        for compact in [False, True]:
            if compact: page.get_by_role('button', name='Collapse sidebar', exact=True).click()
            else:
                expand = page.get_by_role('button', name='Expand sidebar', exact=True)
                if expand.count(): expand.click()
            bounds = page.locator('.kanban-board > section').evaluate_all('(els) => els.map(e => ({left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right}))')
            assert all(b['left'] >= 0 and b['right'] <= width for b in bounds), (width, compact, bounds)
            assert page.locator('.kanban-board').evaluate('(e) => e.scrollWidth <= e.clientWidth + 1')
        print(f'All seven stages fit at {width}px with both sidebar layouts', flush=True)
    page.set_viewport_size({'width': 1440, 'height': 1000})
    page.screenshot(path=str(OUT/'enquiries-all-stages-desktop.png'), full_page=True)
    page.get_by_role('button', name='Expand sidebar', exact=True).click()
    page.goto('http://127.0.0.1:5178/leads')
    page.get_by_role('button', name='Switch workspace, current: Leads CRM').first.click()
    page.get_by_role('menuitem', name='Function Prospectus').click()
    page.wait_for_url('**/prospectus')
    page.goto('http://127.0.0.1:5178/prospectus/'+FP['_id'])
    page.get_by_role('button', name='Menu', exact=True).click()
    page.locator('#fp-menu').fill('Updated test menu')
    page.get_by_role('button', name='Party', exact=True).click()
    assert not page.locator('#fp-menu').is_visible()
    page.get_by_role('button', name='Menu', exact=True).click()
    assert page.locator('#fp-menu').input_value() == 'Updated test menu'
    assert page.get_by_text('Unsaved changes', exact=True).is_visible()
    page.get_by_role('button', name='All fields', exact=True).click()
    assert page.locator('#fp-menu').is_visible() and page.locator('#fp-party').is_visible()
    page.goto('http://127.0.0.1:5178/users')
    page.get_by_role('button', name='Add user', exact=True).click()
    page.get_by_role('dialog').wait_for()
    page.screenshot(path=str(OUT/'add-user-desktop.png'), full_page=True)
    page.keyboard.press('Escape')
    assert page.get_by_role('dialog').count() == 0
    # A separate, logged-out context exercises the real sign-in layout.
    login = browser.new_page(viewport={'width': 1440, 'height': 1000})
    login.goto('http://127.0.0.1:5178/login')
    login.get_by_role('button', name='Sign in', exact=True).wait_for()
    login.screenshot(path=str(OUT/'login-desktop.png'), full_page=True)
    login.close()
    assert not errors, errors
    browser.close()
    print('Desktop navigation, persistent sidebar, form-state retention, dialogs and runtime checks passed.', flush=True)
