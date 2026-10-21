(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = { book: null, published: null, versions: [], rateDefinitions: [], wasteDefinitions: [], page: 0, pageSize: 18, dirty: false, busy: false, toastTimer: null };
  const ui = {
    login: $('#loginView'), dashboard: $('#dashboardView'), loginForm: $('#loginForm'), password: $('#adminPassword'),
    configHint: $('#configHint'), logout: $('#logoutBtn'), toast: $('#toast'), priceList: $('#priceList'),
    search: $('#searchInput'), category: $('#categoryFilter'), status: $('#statusFilter'), missingOnly: $('#missingOnly'),
    save: $('#saveDraftBtn'), publish: $('#publishBtn'), importBtn: $('#importBtn'), importFile: $('#importFile'), exportBtn: $('#exportBtn'), addItem: $('#addItemBtn'),
    dialog: $('#itemDialog'), itemForm: $('#newItemForm'), closeDialog: $('#closeDialog'), cancelNewItem: $('#cancelNewItem'),
    history: $('#historyRows'), publishWarning: $('#publishWarning'), rateList: $('#rateList'), rateSearch: $('#rateSearch'), wasteRateList: $('#wasteRateList')
  };
  const api = async (url, options = {}) => {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
    let body; try { body = await response.json(); } catch { body = { ok: false, error: 'استجابة غير مفهومة من الخادم.' }; }
    if (!response.ok || body.ok === false) { const error = new Error(body.error || `HTTP ${response.status}`); error.status = response.status; error.payload = body; throw error; }
    return body;
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const numInput = value => value == null ? '' : esc(String(value));
  const isPriced = p => p && p.active !== false && p.status !== 'missing' && p.avg != null && p.avg !== '' && Number.isFinite(Number(p.avg)) && Number(p.avg) > 0;
  function stats(book = state.book) {
    if (!book?.prices) return { active:0, priced:0, missing:0, percent:0, local:0, national:0, estimate:0, stale:0 };
    const active = book.prices.filter(p => p.active !== false), priced = active.filter(isPriced);
    const staleDays = Math.max(1, Number(book.settings?.staleDays ?? 90));
    const stale = priced.filter(p => {
      if (!p.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(p.date))) return true;
      const t = Date.parse(`${p.date}T00:00:00Z`);
      return !Number.isFinite(t) || (Date.now() - t) / 86400000 > staleDays;
    }).length;
    return {
      active: active.length, priced: priced.length, missing: active.length - priced.length,
      percent: active.length ? Math.round(priced.length / active.length * 1000) / 10 : 0,
      local: active.filter(p => p.status === 'local').length,
      national: active.filter(p => p.status === 'national').length,
      estimate: active.filter(p => p.status === 'estimate').length,
      stale
    };
  }
  function showToast(message, type = 'success') {
    ui.toast.textContent = message; ui.toast.className = `toast ${type}`;
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => ui.toast.classList.add('hidden'), 6000);
  }
  function markDirty() {
    state.dirty = true;
    $('#draftState').textContent = 'توجد تعديلات غير محفوظة';
    $('#draftState').style.background = '#fff4d8';
    updateStats();
  }
  function updateStats() {
    const s = stats();
    $('#activeCount').textContent = s.active.toLocaleString('en-US');
    $('#pricedCount').textContent = s.priced.toLocaleString('en-US');
    $('#missingCount').textContent = s.missing.toLocaleString('en-US');
    $('#coverageCount').textContent = `${s.percent}%`;
    $('#coverageBar').style.width = `${Math.max(0, Math.min(100, s.percent))}%`;
    const min = Number(state.book?.settings?.minCoverage ?? 0.7) * 100;
    $('#coverageHint').textContent = `حد النشر ${Math.round(min)}% · محلي ${s.local} · بديل وطني ${s.national} · تقديري ${s.estimate} · أقدم من ${Number(state.book?.settings?.staleDays ?? 90)} يومًا: ${s.stale}. التغطية الرقمية لا تعني حداثة السعر أو اعتماده.`;
    const enough = s.percent >= min;
    ui.publishWarning.textContent = enough
      ? `التغطية الحالية ${s.percent}% وتحقق الحد المطلوب ${Math.round(min)}%. راجع المصادر والتواريخ قبل النشر.`
      : `التغطية ${s.percent}% فقط، أقل من الحد ${Math.round(min)}%. لا يمكن النشر قبل استكمال الأسعار أو تعديل حد التغطية بعد مراجعة واعية.`;
    ui.publishWarning.className = `hint ${enough ? 'hint-success' : 'hint-warning'}`;
    ui.publish.disabled = state.busy;
    ui.save.disabled = state.busy;
  }
  function settingsToUI() {
    const s = state.book.settings || {};
    $('#settingMargin').value = numInput(s.margin ?? 15);
    $('#settingCoverage').value = Math.round(Number(s.minCoverage ?? 0.7) * 100);
    $('#settingMode').value = s.marginMode || 'comprehensive';
    $('#settingStaleDays').value = numInput(s.staleDays ?? 90);
    $('#settingSteelFactor').value = numInput(s.steelFactor ?? 0.08);
    $('#settingConcreteFactor').value = numInput(s.concreteFactor ?? 0.35);
    $('#settingBasementSteelFactor').value = numInput(s.basementSteelFactor ?? 0.08);
    $('#settingBasementConcreteFactor').value = numInput(s.basementConcreteFactor ?? 0.35);
  }
  function renderRates() {
    if (!ui.rateList || !state.book) return;
    const q = ui.rateSearch.value.trim().toLocaleLowerCase('ar');
    const saved = state.book.settings.resourceRates || {};
    const rows = state.rateDefinitions.filter(def => !q || [def.key, def.unit, def.basis].some(v => String(v || '').toLocaleLowerCase('ar').includes(q)));
    ui.rateList.innerHTML = rows.map(def => {
      const current = saved[def.key] || {};
      const value = current.value ?? def.value, low = current.low ?? def.low, high = current.high ?? def.high;
      return `<article class="rate-card"><div class="rate-key">${esc(def.key)}</div><h3>${esc(def.unit || def.key)}</h3><p>${esc(def.basis || 'معدل استهلاك قابل للمراجعة.')}</p><div class="rate-values"><label>أقل نطاق<input type="number" min="0.000001" step="any" data-rate-key="${esc(def.key)}" data-rate-field="low" value="${numInput(low)}" /></label><label>المعدل المركزي<input type="number" min="0.000001" step="any" data-rate-key="${esc(def.key)}" data-rate-field="value" value="${numInput(value)}" /></label><label>أعلى نطاق<input type="number" min="0.000001" step="any" data-rate-key="${esc(def.key)}" data-rate-field="high" value="${numInput(high)}" /></label></div></article>`;
    }).join('') || '<div class="empty-state">لا توجد معدلات مطابقة للبحث.</div>';
  }
  function renderWasteRates() {
    if (!ui.wasteRateList || !state.book) return;
    const saved = state.book.settings.boqWastePercentages || {};
    ui.wasteRateList.innerHTML = state.wasteDefinitions.map(def => {
      const current = saved[def.key] == null ? def.defaultPercent : saved[def.key];
      return `<article class="rate-card waste-rate-card"><div class="rate-key">${esc(def.category)}</div><h3>${esc(def.label)}</h3><p>${esc(def.note || 'نسبة هالك قابلة للتعديل بواسطة المهندس.')}</p><label>نسبة الهالك (%)<input type="number" min="0" max="100" step="0.5" inputmode="decimal" data-waste-key="${esc(def.key)}" value="${numInput(current)}" /></label></article>`;
    }).join('') || '<div class="empty-state">لا توجد نسب هالك.</div>';
  }
  function applyRateCompatibility(key, item, def) {
    const settings = state.book.settings || (state.book.settings = {});
    const rawLow = item.low == null || item.low === '' ? Number(def.low) : Number(item.low);
    const rawHigh = item.high == null || item.high === '' ? Number(def.high) : Number(item.high);
    const low = Math.min(rawLow, rawHigh), high = Math.max(rawLow, rawHigh);
    let value;
    if (item.value == null || item.value === '') value = low === high ? low : (Number(def.value) >= low && Number(def.value) <= high ? Number(def.value) : (low + high) / 2);
    else value = Number(item.value);
    settings.modelRates ||= {};
    const normalized = { low, value, high };
    settings.modelRates[key] = { ...normalized };
    const aliases = {
      plasterSurfaceM2PerM2Built:['plasterM2PerM2Built'],
      puttyKgPerM2Surface:['puttyKgPerM2Apartment'],
      sealerLPerM2Surface:['sealerLPerM2Apartment'],
      interiorPaintLPerM2Surface:['paintLPerM2Apartment'],
      floorTileM2PerM2Apartment:['floorTileM2PerM2Apartment'],
      wetTileM2PerM2Apartment:['wetTileM2PerM2Apartment'],
      floorTileCementKgPerM2:['tileCementKgPerM2'],
      floorTileSandM3PerM2:['tileSandM3PerM2']
    };
    for (const alias of aliases[key] || []) settings.modelRates[alias] = { ...normalized };
    const legacy = {
      steelKgPerM2:['steelFactor',1/1000,'settingSteelFactor'],
      concreteM3PerM2:['concreteFactor',1,'settingConcreteFactor'],
      basementSteelKgPerM2:['basementSteelFactor',1/1000,'settingBasementSteelFactor'],
      basementConcreteM3PerM2:['basementConcreteFactor',1,'settingBasementConcreteFactor'],
      tileWaste:['tileWastePercent',1,null]
    }[key];
    if (legacy) {
      settings[legacy[0]] = value * legacy[1];
      if (legacy[2]) $(`#${legacy[2]}`).value = numInput(settings[legacy[0]]);
    }
  }
  function updateRateFromInput(target) {
    const key = target.dataset.rateKey, field = target.dataset.rateField;
    if (!key || !['low','value','high'].includes(field)) return;
    const def = state.rateDefinitions.find(x => x.key === key); if (!def) return;
    const settings = state.book.settings || (state.book.settings = {});
    settings.resourceRates ||= {};
    const item = settings.resourceRates[key] || { low:def.low, value:def.value, high:def.high };
    item[field] = target.value === '' ? null : Number(target.value);
    settings.resourceRates[key] = item;
    applyRateCompatibility(key, item, def);
    markDirty();
  }

  function readSettingInputs(event) {
    if (!state.book) return;
    const s = state.book.settings || (state.book.settings = {});
    const pairs = [
      ['settingMargin','margin', v => Number(v)],
      ['settingCoverage','minCoverage', v => Number(v) / 100],
      ['settingStaleDays','staleDays', v => Number(v)],
      ['settingSteelFactor','steelFactor', v => Number(v)],
      ['settingConcreteFactor','concreteFactor', v => Number(v)],
      ['settingBasementSteelFactor','basementSteelFactor', v => Number(v)],
      ['settingBasementConcreteFactor','basementConcreteFactor', v => Number(v)]
    ];
    for (const [id, key, parse] of pairs) { const raw = $(`#${id}`).value; if (raw !== '') s[key] = parse(raw); }
    // Mirror legacy setting inputs into the shared-rate registry so the frozen-engine
    // compatibility fields and the advanced rate cards cannot silently diverge.
    const legacyRateInputs = [
      ['settingSteelFactor','steelKgPerM2',1000],
      ['settingConcreteFactor','concreteM3PerM2',1],
      ['settingBasementSteelFactor','basementSteelKgPerM2',1000],
      ['settingBasementConcreteFactor','basementConcreteM3PerM2',1]
    ];
    s.resourceRates ||= {};
    for (const [id,key,scale] of legacyRateInputs) {
      if (event?.target?.id !== id) continue;
      const raw = $(`#${id}`).value;
      if (raw === '' || !Number.isFinite(Number(raw))) continue;
      const value = Number(raw) * scale;
      const def = state.rateDefinitions.find(x => x.key === key);
      const current = s.resourceRates[key] || { low:def?.low ?? value, high:def?.high ?? value, value };
      current.value = value;
      current.low = Math.min(Number(current.low ?? value), value);
      current.high = Math.max(Number(current.high ?? value), value);
      s.resourceRates[key] = current;
      if (def) applyRateCompatibility(key, current, def);
    }
    s.marginMode = $('#settingMode').value;
    renderRates();
    markDirty();
  }
  function selectedItems() {
    const q = ui.search.value.trim().toLocaleLowerCase('ar');
    const category = ui.category.value, status = ui.status.value;
    return state.book.prices.map((p, index) => ({ p, index })).filter(({p}) => {
      if (category && (p.category || 'غير مصنف') !== category) return false;
      if (status && p.status !== status) return false;
      if (ui.missingOnly.checked && isPriced(p)) return false;
      if (q && ![p.name,p.id,p.category,p.unit,p.source,p.date].some(v => String(v || '').toLocaleLowerCase('ar').includes(q))) return false;
      return true;
    });
  }
  function fillCategoryFilter() {
    const previous = ui.category.value;
    const cats = [...new Set(state.book.prices.map(p => p.category || 'غير مصنف'))].sort((a,b) => a.localeCompare(b,'ar'));
    ui.category.innerHTML = '<option value="">كل التصنيفات</option>' + cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    ui.category.value = cats.includes(previous) ? previous : '';
  }
  function statusOptions(current) {
    const options = [['missing','ناقص'],['local','محلي'],['national','بديل وطني'],['priced','مسعّر']];
    if (current && !options.some(x => x[0] === current)) options.push([current,current]);
    return options.map(([v,label]) => `<option value="${esc(v)}" ${v === current ? 'selected' : ''}>${esc(label)}</option>`).join('');
  }
  function priceCard(p, index) {
    const statusLabels = { missing:'ناقص', national:'بديل وطني', local:'محلي', priced:'مسعّر' };
    const inactive = p.active === false;
    return `<article class="price-card ${inactive ? 'is-inactive' : ''}" data-card-index="${index}">
      <div class="price-card-header"><span class="price-id">${esc(p.id || `ROW-${index + 1}`)}</span><div class="price-name"><input aria-label="اسم البند" data-index="${index}" data-field="name" value="${esc(p.name)}" /></div><div class="price-card-actions"><label class="active-control"><input type="checkbox" data-index="${index}" data-field="active" ${!inactive ? 'checked' : ''}/> نشط</label></div></div>
      <div class="price-fields"><div class="price-range">
        <label>أقل سعر<input aria-label="أقل سعر" type="number" min="0" step="0.01" data-index="${index}" data-field="low" value="${numInput(p.low)}" placeholder="ناقص" /></label>
        <label>متوسط السعر<input aria-label="متوسط السعر" type="number" min="0" step="0.01" data-index="${index}" data-field="avg" value="${numInput(p.avg)}" placeholder="ناقص" /></label>
        <label>أعلى سعر<input aria-label="أعلى سعر" type="number" min="0" step="0.01" data-index="${index}" data-field="high" value="${numInput(p.high)}" placeholder="ناقص" /></label>
      </div><label>الوحدة<input aria-label="الوحدة" data-index="${index}" data-field="unit" value="${esc(p.unit)}" /></label></div>
      <div class="price-metadata"><label>التصنيف<input data-index="${index}" data-field="category" value="${esc(p.category || '')}" /></label><label>حالة السعر<select data-index="${index}" data-field="status">${statusOptions(p.status || 'missing')}</select></label></div>
      <div class="price-metadata"><label>تاريخ السعر<input type="date" data-index="${index}" data-field="date" value="${esc(p.date || '')}" /></label><label>النقل<select data-index="${index}" data-field="transport">${[['yes','مشمول'],['no','غير مشمول'],['unknown','غير معروف'],['not-applicable','لا ينطبق'],['included','ضمن السعر'],['excluded','خارج السعر']].map(([v,l])=>`<option value="${v}" ${p.transport===v?'selected':''}>${l}</option>`).join('')}</select></label></div>
      <div class="price-metadata"><label class="field-wide">مصدر السعر / المورد<input data-index="${index}" data-field="source" value="${esc(p.source || '')}" placeholder="اسم المورد أو مرجع السعر" /></label></div>
      <div class="price-card-footer"><span class="status-chip ${esc(p.status || 'missing')}">${esc(statusLabels[p.status] || p.status || 'ناقص')}</span><small>${isPriced(p) ? 'يُحتسب ضمن التغطية' : 'لن يُحتسب كسعر مسعّر'}</small><button class="deactivate-btn" type="button" data-deactivate="${index}" title="تعطيل البند" aria-label="تعطيل البند">×</button></div>
    </article>`;
  }
  function renderCatalog() {
    if (!state.book) return;
    const rows = selectedItems(), maxPage = Math.max(0, Math.ceil(rows.length / state.pageSize) - 1);
    state.page = Math.min(state.page, maxPage);
    const view = rows.slice(state.page * state.pageSize, (state.page + 1) * state.pageSize);
    ui.priceList.innerHTML = view.length ? view.map(({p,index}) => priceCard(p,index)).join('') : '<div class="empty-state">لا توجد بنود مطابقة. جرّب تغيير البحث أو الفلاتر.</div>';
    $('#resultsCount').textContent = `${rows.length.toLocaleString('en-US')} بند مطابق`;
    $('#pageLabel').textContent = `صفحة ${state.page + 1} من ${maxPage + 1}`;
    $('#prevPage').disabled = state.page <= 0;
    $('#nextPage').disabled = state.page >= maxPage;
  }
  function renderHistory() {
    const list = state.versions || [];
    if (!list.length) { ui.history.innerHTML = '<tr><td colspan="5" class="muted">لا توجد إصدارات مسجلة بعد. يظهر الإصدار الحالي في أعلى الصفحة.</td></tr>'; return; }
    ui.history.innerHTML = list.map(v => `<tr><td><b dir="ltr">${esc(v.version)}</b></td><td>${esc(v.published_at ? new Date(v.published_at).toLocaleString('ar-EG') : '—')}</td><td>${esc(v.published_by || '—')}</td><td>${v.coverage_percent == null ? '—' : `${Number(v.coverage_percent).toFixed(1)}%`}</td><td>${v.priced_items == null ? '—' : `${v.priced_items} / ${v.active_items}`}</td></tr>`).join('');
  }
  function setDraftLabel() {
    $('#draftState').textContent = state.dirty ? 'توجد تعديلات غير محفوظة' : 'مسودة محفوظة';
    $('#draftState').style.background = state.dirty ? '#fff4d8' : '#e9f8f0';
    $('#draftState').style.color = state.dirty ? '#8a5b04' : '#15835a';
  }
  async function loadBook() {
    const data = await api('/api/admin/price-book');
    state.book = data.draft; state.published = data.published; state.versions = data.versions || []; state.dirty = false;
    $('#publishedVersion').textContent = data.published?.version || '—';
    $('#publishedAt').textContent = data.published?.publishedAt ? `آخر نشر: ${new Date(data.published.publishedAt).toLocaleString('ar-EG')}` : 'لا يوجد سجل نشر';
    state.rateDefinitions = data.rateDefinitions || [];
    state.wasteDefinitions = data.wasteDefinitions || [];
    settingsToUI(); fillCategoryFilter(); renderCatalog(); renderRates(); renderWasteRates(); renderHistory(); setDraftLabel(); updateStats();
  }
  async function saveDraft(silent = false) {
    if (state.busy) return false;
    readSettingInputs();
    state.busy = true; ui.save.disabled = ui.publish.disabled = true;
    try {
      const data = await api('/api/admin/price-book', { method: 'PUT', body: JSON.stringify({ book: state.book }) });
      state.dirty = false; setDraftLabel();
      if (!silent) showToast(`تم حفظ المسودة. التغطية ${data.draftStats.coveragePercent}% — الأسعار المنشورة لم تتغير بعد.`, 'success');
      return true;
    } catch (e) { showToast(e.message, 'error'); return false; }
    finally { state.busy = false; updateStats(); }
  }
  async function publish() {
    if (state.busy) return;
    const s = stats(); const minimum = Number(state.book.settings.minCoverage ?? .7) * 100;
    const warning = s.percent < minimum ? `التغطية الحالية ${s.percent}% أقل من الحد ${Math.round(minimum)}%. لا يمكن النشر إلا بعد استكمال الأسعار أو تعديل الحد بنفسك بعد المراجعة.\n\nهل تريد محاولة النشر الآن؟` : `سيصبح الإصدار الحالي هو المعتمد لحسابات العملاء الجديدة.\nالتغطية: ${s.percent}%\nهامش التسعير: ${state.book.settings.margin}%\n\nهل تريد المتابعة؟`;
    if (!window.confirm(warning)) return;
    const saved = await saveDraft(true); if (!saved) return;
    state.busy = true; ui.publish.disabled = ui.save.disabled = true;
    try {
      const data = await api('/api/admin/publish', { method: 'POST', body: '{}' });
      showToast(`${data.message} الإصدار ${data.version} — التغطية ${data.stats.coveragePercent}%.`, 'success');
      await loadBook();
    } catch (e) {
      if (e.status === 409) { ui.publishWarning.textContent = e.message; ui.publishWarning.className = 'hint hint-warning'; }
      showToast(e.message, 'error');
    } finally { state.busy = false; updateStats(); }
  }
  function downloadBook() {
    const blob = new Blob([JSON.stringify(state.book, null, 2) + '\n'], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `beno-price-book-draft-${new Date().toISOString().slice(0,10)}.json`; document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
  async function importBook(file) {
    try {
      if (file.size > 3 * 1024 * 1024) throw new Error('الملف أكبر من الحد المسموح (3MB).');
      const doc = JSON.parse(await file.text());
      if (!doc || !Array.isArray(doc.prices)) throw new Error('ملف JSON يجب أن يحتوي على prices[].');
      if (!window.confirm(`استيراد ${doc.prices.length} بندًا واستبدال المسودة الحالية؟ لن تتغير أسعار الزوار حتى النشر.`)) return;
      state.book = doc; state.book.settings ||= {};
      state.book.settings.minCoverage ??= .70; state.book.settings.marginMode ||= 'comprehensive';
      state.page = 0; settingsToUI(); fillCategoryFilter(); renderCatalog(); renderRates(); markDirty(); showToast('تم تحميل الملف إلى المسودة. اضغط حفظ المسودة ثم انشر بعد المراجعة.', 'info');
    } catch (e) { showToast(`تعذر الاستيراد: ${e.message}`, 'error'); }
    finally { ui.importFile.value = ''; }
  }
  function addNewItem(form) {
    const v = Object.fromEntries(new FormData(form).entries());
    const cleanNum = key => v[key] === '' ? null : Number(v[key]);
    const maxId = state.book.prices.reduce((n,p) => { const m = String(p.id || '').match(/^P(\d+)$/); return m ? Math.max(n, Number(m[1])) : n; }, 0);
    const item = { id:`ADM-${cryptoRandom()}`, name:v.name.trim(), category:v.category.trim(), unit:v.unit.trim(), low:cleanNum('low'), avg:cleanNum('avg'), high:cleanNum('high'), date:v.date || '', source:v.source.trim(), status:v.status || 'missing', confidence:'غير محددة', transport:'unknown', qtyMode:'manual', factor:0, calc:false, scope:'all', packages:['economic','semi','medium','luxury'], active:true, adminCatalogOnly:true };
    if (item.status !== 'missing' && (!item.avg || !item.source)) { showToast('أدخل متوسط السعر ومصدرًا قبل تصنيف البند كمسعّر.', 'error'); return false; }
    if (item.low != null && item.avg != null && item.low > item.avg || item.avg != null && item.high != null && item.avg > item.high) { showToast('راجع ترتيب أقل سعر والمتوسط وأعلى سعر.', 'error'); return false; }
    state.book.prices.push(item); ui.dialog.close(); form.reset(); state.page = 0; fillCategoryFilter(); renderCatalog(); markDirty(); showToast('أُضيف البند للمسودة. البنود الجديدة لا تدخل في الحصر تلقائيًا حتى ربطها بمحرك الكميات.', 'info'); return true;
  }
  function cryptoRandom() { return Math.random().toString(36).slice(2, 10).toUpperCase(); }
  function updatePriceFromInput(target) {
    const index = Number(target.dataset.index), field = target.dataset.field;
    if (!Number.isInteger(index) || !state.book.prices[index] || !field) return;
    const allowed = new Set(['name','category','unit','low','avg','high','status','date','source','transport','active']);
    if (!allowed.has(field)) return;
    const p = state.book.prices[index];
    if (field === 'active') p.active = target.checked;
    else if (['low','avg','high'].includes(field)) p[field] = target.value === '' ? null : Number(target.value);
    else p[field] = target.value;
    markDirty();
    const card = target.closest('.price-card');
    if (card) {
      card.classList.toggle('is-inactive', p.active === false);
      const foot = card.querySelector('.price-card-footer small');
      if (foot) foot.textContent = isPriced(p) ? 'يُحتسب ضمن التغطية' : 'لن يُحتسب كسعر مسعّر';
      const chip = card.querySelector('.status-chip');
      if (chip && field === 'status') { const labels = {missing:'ناقص',national:'بديل وطني',local:'محلي',priced:'مسعّر'}; chip.className = `status-chip ${p.status || 'missing'}`; chip.textContent = labels[p.status] || p.status || 'ناقص'; }
    }
  }
  function showLogin(configured, authenticated) {
    ui.login.classList.toggle('hidden', authenticated);
    ui.dashboard.classList.toggle('hidden', !authenticated);
    ui.logout.classList.toggle('hidden', !authenticated);
    if (!configured) {
      ui.configHint.textContent = 'الدخول غير مهيأ بعد. شغّل npm run admin:setup محليًا، أو عيّن BENO_ADMIN_PASSWORD (12 حرفًا على الأقل) وBENO_ADMIN_SESSION_SECRET (32 حرفًا على الأقل) في Vercel ثم أعد النشر.';
      ui.configHint.classList.remove('hidden');
    } else ui.configHint.classList.add('hidden');
  }
  // ---------------------------------------------------------------------------
  // Agent learning console: unmatched clusters + verified lexicon adoption.
  async function loadLearning() {
    const countsEl = $('#learningCounts');
    const backendEl = $('#learningBackend');
    const clustersEl = $('#clusterList');
    const lexiconEl = $('#lexiconList');
    try {
      const data = await api('/api/admin/agent');
      const learning = data.learning || {};
      $('#learningAdoptBtn').classList.toggle('hidden', !learning.available);
      backendEl.textContent = learning.available ? 'المصدر: Supabase (متصل)' : 'المصدر: غير متاح — راجع ترحيل قاعدة البيانات';
      countsEl.textContent = learning.available ? `${learning.unmatchedCount || 0} رسالة غير مفهومة · ${learning.verifiedCount || 0} إضافة معتمدة` : '—';
      const clusters = learning.clusters || [];
      const intentKeys = Array.isArray(learning.availableIntents) ? learning.availableIntents : [];
      const intentLabels = { calculate:'حساب المقايسة', price_lookup:'استعلام سعر', compare_packages:'مقارنة الباقات', compare_prices:'مقارنة الأسعار', scenario:'سيناريو بديل', thanks:'شكر', request_engineer:'طلب مهندس', why:'سبب السؤال', explain:'شرح بند', gaps:'النواقص', status:'حالة المشروع', greet:'تحية', help:'مساعدة', start_over:'بدء من جديد', confused:'طلب توضيح', confirm:'تأكيد', deny:'نفي' };
      clustersEl.replaceChildren();
      if (!clusters.length) clustersEl.innerHTML = '<p class="muted">ما فيهش عناقيد جديدة — المحلل فاهم الرسائل الحالية.</p>';
      clusters.forEach((cluster, i) => {
        const card = document.createElement('div');
        card.className = 'rate-item';
        const samples = (cluster.samples || []).map(s => esc(s)).join('<br>');
        card.innerHTML = `
          <label class="check-filter"><input type="checkbox" data-cluster="${i}" checked /> عنقود ${cluster.size}× · ${esc((cluster.intents || []).join('، ') || 'نيّة غير محددة')}</label>
          <p>${samples}</p>`;
        const mapLabel = document.createElement('label');
        mapLabel.className = 'learning-intent-map';
        mapLabel.appendChild(document.createTextNode('علّم العبارة باعتبارها: '));
        const select = document.createElement('select');
        select.dataset.clusterIntent = String(i);
        const prompt = document.createElement('option');
        prompt.value = ''; prompt.textContent = 'اختر النية الصحيحة…'; select.appendChild(prompt);
        intentKeys.filter(key => key !== 'unknown' && key !== 'empty' && key !== 'answer_pending').forEach(key => {
          const option = document.createElement('option'); option.value = key; option.textContent = intentLabels[key] ? `${intentLabels[key]} (${key})` : key; select.appendChild(option);
        });
        const knownClusterIntents = [...new Set((cluster.intents || []).filter(key => intentKeys.includes(key) && !['unknown','empty','answer_pending'].includes(key)))];
        if (knownClusterIntents.length === 1) select.value = knownClusterIntents[0];
        mapLabel.appendChild(select); card.appendChild(mapLabel);
        clustersEl.appendChild(card);
      });
      lexiconEl.replaceChildren();
      const rows = data.lexicon || [];
      if (!rows.length) lexiconEl.innerHTML = '<p class="muted">ما فيهش إضافات معتمدة بعد. اعتماد عنقود يضيف مرادف للمعجم.</p>';
      rows.slice(0, 30).forEach(r => {
        const chip = document.createElement('div');
        chip.className = 'rate-item';
        chip.textContent = `${r.kind}${r.key ? ' · ' + r.key : ''} — ${r.value}`;
        lexiconEl.appendChild(chip);
      });
    } catch (e) {
      countsEl.textContent = '—'; backendEl.textContent = 'المصدر: غير متاح';
      clustersEl.innerHTML = `<p class="muted">${esc(e.message)}</p>`;
      $('#learningAdoptBtn').classList.add('hidden');
    }
  }
  async function adoptLearning() {
    const clusters = await api('/api/admin/agent').then(d => d.learning?.clusters || []).catch(() => []);
    const entries = [];
    $$('#clusterList input[type="checkbox"][data-cluster]').forEach(box => {
      if (!box.checked) return;
      const cluster = clusters[Number(box.dataset.cluster)];
      if (!cluster) return;
      const sample = (cluster.samples || [])[0] || '';
      const mapping = $(`#clusterList select[data-cluster-intent="${box.dataset.cluster}"]`);
      const intent = mapping?.value || '';
      if (!sample.trim() || !intent) return;
      entries.push({ kind: 'intents', key: intent, value: sample.slice(0, 60), source: 'cluster-adoption' });
    });
    if (!entries.length) { showToast('حدّد عنقودًا واختر النية الصحيحة له قبل الاعتماد.', 'error'); return; }
    try {
      const result = await api('/api/admin/agent', { method: 'POST', body: JSON.stringify({ entries }) });
      showToast(`${result.inserted || entries.length} إضافة اتفعلت؛ طبقة الفهم بتستخدمها من الطلب الجاي.`, 'success');
      await loadLearning();
    } catch (e) { showToast(e.message, 'error'); }
  }
  $('#learningRefreshBtn')?.addEventListener('click', async () => {
    const button = $('#learningRefreshBtn'); button.disabled = true;
    try { await loadLearning(); } finally { button.disabled = false; }
  });
  $('#learningAdoptBtn')?.addEventListener('click', () => adoptLearning());
  async function boot() {
    try {
      const session = await api('/api/admin/session');
      showLogin(session.configured, session.authenticated);
      if (session.authenticated) { await loadBook(); loadLearning(); }
    } catch (e) { showLogin(false, false); showToast(e.message, 'error'); }
  }
  ui.loginForm.addEventListener('submit', async event => {
    event.preventDefault(); const button = $('button[type="submit"]', ui.loginForm); button.disabled = true;
    try {
      const result = await api('/api/admin/session', { method: 'POST', body: JSON.stringify({ action:'login', password:ui.password.value }) });
      ui.password.value = ''; showLogin(true, result.authenticated); showToast('تم تسجيل الدخول بنجاح.', 'success'); await loadBook();
    } catch (e) { showToast(e.message, 'error'); }
    finally { button.disabled = false; }
  });
  ui.logout.addEventListener('click', async () => { try { await api('/api/admin/session', { method:'POST', body:JSON.stringify({action:'logout'}) }); } catch {} state.book = null; showLogin(true, false); showToast('تم تسجيل الخروج.', 'info'); });
  ui.save.addEventListener('click', () => saveDraft(false));
  ui.publish.addEventListener('click', publish);
  ui.importBtn.addEventListener('click', () => ui.importFile.click());
  ui.importFile.addEventListener('change', () => { const file = ui.importFile.files?.[0]; if (file) importBook(file); });
  ui.exportBtn.addEventListener('click', downloadBook);
  ui.addItem.addEventListener('click', () => ui.dialog.showModal());
  ui.closeDialog.addEventListener('click', () => ui.dialog.close());
  ui.cancelNewItem.addEventListener('click', () => ui.dialog.close());
  ui.itemForm.addEventListener('submit', event => { event.preventDefault(); addNewItem(ui.itemForm); });
  ui.search.addEventListener('input', () => { state.page = 0; renderCatalog(); });
  ui.rateSearch.addEventListener('input', renderRates);
  ui.rateList.addEventListener('input', event => updateRateFromInput(event.target));
  if (ui.wasteRateList) ui.wasteRateList.addEventListener('change', event => {
    const input = event.target.closest('[data-waste-key]'); if (!input || !state.book) return;
    const key = input.dataset.wasteKey; const value = input.value.trim() === '' ? null : Number(input.value);
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) { showToast('نسبة الهالك يجب أن تكون من 0 إلى 100%.', 'error'); renderWasteRates(); return; }
    state.book.settings.boqWastePercentages ||= {};
    if (value === null) delete state.book.settings.boqWastePercentages[key]; else state.book.settings.boqWastePercentages[key] = value;
    markDirty(); showToast('تم تحديث نسبة الهالك في المسودة؛ احفظ التعديلات لتطبيقها.', 'info');
  });
  ui.category.addEventListener('change', () => { state.page = 0; renderCatalog(); });
  ui.status.addEventListener('change', () => { state.page = 0; renderCatalog(); });
  ui.missingOnly.addEventListener('change', () => { state.page = 0; renderCatalog(); });
  $('#prevPage').addEventListener('click', () => { state.page = Math.max(0, state.page - 1); renderCatalog(); });
  $('#nextPage').addEventListener('click', () => { state.page += 1; renderCatalog(); });
  ui.priceList.addEventListener('input', event => updatePriceFromInput(event.target));
  ui.priceList.addEventListener('change', event => {
    const field = event.target.dataset.field;
    updatePriceFromInput(event.target);
    if (['status','active','category'].includes(field)) queueMicrotask(() => { fillCategoryFilter(); renderCatalog(); });
  });
  ui.priceList.addEventListener('click', event => { const button = event.target.closest('[data-deactivate]'); if (!button) return; const i = Number(button.dataset.deactivate); if (state.book.prices[i]) { state.book.prices[i].active = false; markDirty(); renderCatalog(); } });
  ['settingMargin','settingCoverage','settingStaleDays','settingMode','settingSteelFactor','settingConcreteFactor','settingBasementSteelFactor','settingBasementConcreteFactor'].forEach(id => $(`#${id}`).addEventListener('input', readSettingInputs));
  boot();
})();
