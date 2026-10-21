'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const rates = require('../../engines/miyar-rates.js');
const engine = require('../../engines/miyar-engine.js');
const takeoff = require('../../engines/miyar-takeoff.js');
const models = require('../../engines/miyar-project-models.js');
const dialogue = require('../../engines/miyar-dialogue-agent.js');
const workflow = require('../../engines/miyar-workflow-engine.js');
const conversation = require('./conversation.cjs');
const pricingMemory = require('./pricing-memory.cjs');
const workBreakdown = require('../../engines/miyar-wbs.js');
const boqKnowledge = require('./boq-knowledge.cjs');

const ROOT = path.resolve(__dirname, '../..');
const BOOK_DIR = path.join(ROOT, 'api', '_data');
const PROJECT_KEYS = new Set(['type','pack','scope','area','floors','rooms','bathrooms','unitsPerFloor','basement','elevator','kitchen','ac','sewerConnection','mode','location','steelChoice','concreteGrade','manualQuantities','service','areaBasis','modelCode','apartmentArea','apartmentCount','roomsPerApartment','completed','includeBasicPlaster','concreteMethod','foundationSystem','soil','groundwater','quoteBasis','plotArea']);
const agent=require('./agent.cjs');
const explainer=require('../../engines/beno-explain.js');
const TOOLS = new Set(['estimate.run','package.compare','boq.explain','price-catalog.search','resource.takeoff','price-catalog.audit','scenario.evaluate','project.assumptions','conversation.extract','conversation.plan']);
const PACKAGES = ['economic','semi','medium','luxury'];
const SCOPES = ['structure','finishing','turnkey'];
const TYPES = ['residential','commercial','mixed'];
const numberFmt = (v, max=2) => v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v).toLocaleString('en-US',{maximumFractionDigits:max,minimumFractionDigits:0});
const toRaw = v => v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
const moneyFmt = v => { const n=numberFmt(v,0); return n===null ? null : `${n} جنيه`; };
const day = () => new Date().toISOString().slice(0,10);
function loadBook(docOverride = null) {
  let filename = 'published-admin-book';
  let doc = docOverride;
  if (!doc) {
    const explicit = process.env.BENO_PRICE_BOOK_FILE;
    filename = explicit ? path.resolve(explicit) : null;
    if (!filename) {
      const candidates = fs.readdirSync(BOOK_DIR).filter(n => /^price-book\.v\d+\.json$/.test(n)).sort((a,b)=>Number((b.match(/v(\d+)/)||[])[1])-Number((a.match(/v(\d+)/)||[])[1]));
      filename = path.join(BOOK_DIR, candidates[0] || 'price-book.v1.json');
    }
    doc = JSON.parse(fs.readFileSync(filename,'utf8'));
  }
  if (!Array.isArray(doc.prices)) throw new Error('Price book must include a prices array.');
  // A published admin book owns its editable settings; environment values remain fallback defaults for file-based mode.
  const marginValue = docOverride && doc.settings?.margin !== undefined ? doc.settings.margin : (process.env.BENO_MARGIN_PCT === undefined ? (doc.settings?.margin ?? 15) : process.env.BENO_MARGIN_PCT);
  const margin = Number(marginValue);
  if (!Number.isFinite(margin) || margin < 0 || margin > 100) throw new Error('BENO_MARGIN_PCT must be between 0 and 100.');
  const coverageValue = docOverride && doc.settings?.minCoverage !== undefined ? doc.settings.minCoverage : (process.env.BENO_MIN_COVERAGE === undefined ? 0.70 : process.env.BENO_MIN_COVERAGE);
  const minCoverage = Number(coverageValue);
  if (!Number.isFinite(minCoverage) || minCoverage < 0 || minCoverage > 1) throw new Error('BENO_MIN_COVERAGE must be between 0 and 1.');
  const settings = { ...(doc.settings || {}), margin, staleDays: Number(doc.settings?.staleDays || 90) };
  const marginMode = docOverride && doc.settings?.marginMode ? doc.settings.marginMode : (process.env.BENO_MARGIN_MODE || doc.settings?.marginMode || 'comprehensive');
  return { doc, prices: doc.prices, settings, version: String(doc.priceBookVersion || doc.version || path.basename(filename).match(/v\d+/)?.[0] || 'v1'), marginMode, minCoverage, filename };
}
function validateKeys(obj, allowed, label) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error(`${label} must be an object.`);
  const unknown = Object.keys(obj).filter(k => !allowed.has(k));
  if (unknown.length) throw new Error(`Unknown ${label} field(s): ${unknown.join(', ')}.`);
}
function validateManualQuantities(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('manualQuantities must be an object.');
  for (const [k,v] of Object.entries(value)) if (!/^[A-Za-z0-9:_-]{2,96}(?:\.\d{1,2})?$/.test(k) || !Number.isFinite(Number(v)) || Number(v)<0 || Number(v)>1e9) throw new Error('Invalid manual quantity override.');
  return value;
}
function validateProject(value={}) {
  validateKeys(value, PROJECT_KEYS, 'state');
  const p = {...value};
  if (p.type !== undefined && !TYPES.includes(p.type)) throw new Error('type must be residential, commercial, or mixed.');
  if (p.pack !== undefined && !PACKAGES.includes(p.pack)) throw new Error('pack must be economic, semi, medium, or luxury.');
  if (p.scope !== undefined && !SCOPES.includes(p.scope)) throw new Error('scope must be structure, finishing, or turnkey.');
  const bounds = [['area',20,5000],['plotArea',20,1000000],['floors',1,40],['rooms',1,8],['bathrooms',1,8],['unitsPerFloor',1,30]];
  for (const [key,min,max] of bounds) if (p[key] !== undefined && (!Number.isFinite(Number(p[key])) || Number(p[key]) < min || Number(p[key]) > max)) throw new Error(`${key} must be between ${min} and ${max}.`);
  for (const key of ['basement','elevator','kitchen','ac','sewerConnection']) if (p[key] !== undefined && typeof p[key] !== 'boolean') throw new Error(`${key} must be boolean.`);
  if (p.location !== undefined && (typeof p.location !== 'string' || p.location.length > 160)) throw new Error('location must be a short string.');
  if (p.service !== undefined && !['apartment','building','price'].includes(p.service)) throw new Error('service must be apartment, building, or price.');
  if (p.areaBasis !== undefined && !['floor','total','apartment','plot'].includes(p.areaBasis)) throw new Error('areaBasis is invalid.');
  if (p.modelCode !== undefined && (typeof p.modelCode !== 'string' || !/^[A-Z0-9-]{2,40}$/.test(p.modelCode))) throw new Error('modelCode is invalid.');
  if (p.soil !== undefined && (typeof p.soil !== 'string' || p.soil.length > 80)) throw new Error('soil must be a short string.');
  if (p.groundwater !== undefined && typeof p.groundwater !== 'boolean' && !['low','medium','high','unknown'].includes(p.groundwater)) throw new Error('groundwater is invalid.');
  if (p.manualQuantities !== undefined) validateManualQuantities(p.manualQuantities);
  return p;
}
function asEngineProject(project, book) {
  return {...project, mode: book.marginMode === 'supervision' ? 'supervision' : 'comprehensive'};
}
function lineVM(l) {
  const unitPrice = l.price ?? l.unitPrice ?? null;
  const low = l.low ?? l.priceLow ?? null;
  const high = l.high ?? l.priceHigh ?? null;
  const cost = l.lineCost ?? l.cost ?? null;
  const costLow = l.lineCostLow ?? l.costLow ?? null;
  const costHigh = l.lineCostHigh ?? l.costHigh ?? null;
  const quantity = toRaw(l.quantity);
  const hasPrice = !!(l.priced || unitPrice !== null && unitPrice !== undefined && unitPrice !== '');
  const classification = workBreakdown.classifyLine(l);
  return {
    code: String(l.code || ''), title: String(l.title || l.item || 'بند غير محدد'),
    section: classification.section, category: classification.category,
    kind: classification.kind, kindLabel: classification.kindLabel,
    sourceCategory: String(l.category || l.division || ''),
    quantity: numberFmt(quantity), hasQuantity: quantity !== null, billableQuantity: numberFmt(l.billableQuantity), unit: String(l.unit || '—'),
    unitPrice: moneyFmt(unitPrice), lowUnitPrice: moneyFmt(low), highUnitPrice: moneyFmt(high),
    cost: moneyFmt(cost), lowCost: moneyFmt(costLow), highCost: moneyFmt(costHigh),
    costValue: toRaw(cost), lowCostValue: toRaw(costLow), highCostValue: toRaw(costHigh),
    status: String(l.status || l.priceStatus || (hasPrice ? 'priced' : 'missing')),
    priceId: String(l.priceId || ''), priceRowName: String(l.priceRowName || l.priceName || ''),
    source: String(l.source || l.priceSource || ''), date: String(l.date || l.priceDate || ''), transport: String(l.transport || 'unknown'),
    wastePercent: numberFmt(l.wastePercent,2), quantitySource: String(l.quantitySource || l.quantityBasis || (quantity !== null ? 'كمية محسوبة من نموذج المقايسة؛ يلزم تأكيدها على الرسومات' : '')),
    assumption: String(l.assumption || l.basis || l.quantityNote || ''), warnings: (Array.isArray(l.warnings) ? l.warnings : []).map(String),
    priced: hasPrice && quantity !== null && cost !== null && cost !== undefined, hasPrice, required: l.required !== false
  };
}
function publicEstimate(result, project, book) {
  const sourceLines = Array.isArray(result.lines) ? result.lines : [];
  const classifiedPairs = sourceLines.map(source => ({ source, view:lineVM(source) }))
    .sort((a,b)=>workBreakdown.compareLines(a.view,b.view));
  const lines = classifiedPairs.map(pair => pair.view);
  const requiredLines = lines.filter(l => l.required);
  const priceGaps = requiredLines.filter(l => !l.hasPrice);
  const quantityGaps = requiredLines.filter(l => !l.hasQuantity);
  const pricedRequiredCount = requiredLines.filter(l => l.hasPrice).length;
  const quantifiedRequiredCount = requiredLines.filter(l => l.hasQuantity).length;
  const completeRequiredCount = requiredLines.filter(l => l.hasPrice && l.hasQuantity).length;
  // Coverage is required-line price coverage (not a percentage inflated by notes
  // or optional lines). It is necessary but not sufficient to show a main amount.
  const coverage = requiredLines.length ? pricedRequiredCount / requiredLines.length : 0;
  const quantityCoverage = requiredLines.length ? quantifiedRequiredCount / requiredLines.length : 0;
  const completeCoverage = requiredLines.length ? completeRequiredCount / requiredLines.length : 0;
  const readyToShowAmount = coverage >= book.minCoverage && priceGaps.length === 0 && quantityGaps.length === 0;
  const baseline = Number(result.total ?? result.totalKnownPartial ?? result.pricedCost ?? result.directSubtotal ?? 0);
  const low = Number(result.totalLow ?? result.directSubtotalLow ?? result.pricedCost ?? result.directSubtotal ?? 0);
  const high = Number(result.totalHigh ?? result.directSubtotalHigh ?? result.pricedCost ?? result.directSubtotal ?? 0);
  const totalGrossArea = Math.max(1, Number(project.area || project.apartmentArea || 0) * Math.max(1, Number(project.modelCode && String(project.modelCode).startsWith('APT-') ? 1 : project.floors || 1)));
  // Build a hierarchical work breakdown from the existing lines without changing
  // any quantity, unit rate, subtotal, or estimate total. A trade owns its materials
  // and labor together; line kind is a separate attribute, not a separate section.
  const stages = new Map();
  let totalDist = 0;
  classifiedPairs.forEach(pair => {
    const source = pair.source;
    const vm = pair.view;
    const sectionName = vm.section || 'غير مصنف';
    const categoryName = vm.category || 'أعمال غير مصنفة';
    if (!stages.has(sectionName)) stages.set(sectionName, { name:sectionName, raw:0, lineCount:0, pricedCount:0, packages:new Map() });
    const stage = stages.get(sectionName);
    stage.lineCount += 1;
    if (!stage.packages.has(categoryName)) stage.packages.set(categoryName, { name:categoryName, raw:0, lineCount:0, pricedCount:0, kinds:{ material:0, labor:0, equipment:0, service:0, assembly:0, optional:0, note:0 } });
    const pkg = stage.packages.get(categoryName);
    pkg.lineCount += 1;
    if (pkg.kinds[vm.kind] !== undefined) pkg.kinds[vm.kind] += 1;
    const cost = toRaw(source.lineCost ?? source.cost);
    if (vm.priced && cost !== null) {
      stage.raw += cost; stage.pricedCount += 1; totalDist += cost;
      pkg.raw += cost; pkg.pricedCount += 1;
    }
  });
  const orderedStages = [...stages.values()].sort((a,b)=>workBreakdown.compareLines({section:a.name,category:''},{section:b.name,category:''}));
  const stageList = orderedStages.map(stage => {
    const packages = [...stage.packages.values()].sort((a,b)=>workBreakdown.compareLines({section:stage.name,category:a.name},{section:stage.name,category:b.name})).map(pkg => ({
      name:pkg.name, amount:pkg.pricedCount ? moneyFmt(pkg.raw) : null, count:pkg.pricedCount,
      lineCount:pkg.lineCount, unpricedCount:pkg.lineCount-pkg.pricedCount,
      sharePercent:totalDist ? Math.round(pkg.raw/totalDist*100) : 0,
      kinds:pkg.kinds
    }));
    return { name:stage.name, amount:stage.pricedCount ? moneyFmt(stage.raw) : null,
      count:stage.pricedCount, lineCount:stage.lineCount, unpricedCount:stage.lineCount-stage.pricedCount,
      sharePercent:totalDist ? Math.round(stage.raw/totalDist*100) : 0, packages };
  });
  // The engineer-facing BOQ is intentionally concise: one main row per work package
  // and cost type (supply, labor, or a comprehensive execution item). Resource-level
  // quantities and unit rates remain available under each summary row on demand.
  const summaryGroups = new Map();
  lines.filter(l => l.required && l.kind !== 'note' && l.kind !== 'optional').forEach(line => {
    const key = `${line.section}\u0000${line.category}\u0000${line.kind}`;
    if (!summaryGroups.has(key)) summaryGroups.set(key, { section:line.section, category:line.category, kind:line.kind, kindLabel:line.kindLabel, items:[] });
    summaryGroups.get(key).items.push(line);
  });
  const summaryLabel = (group) => {
    const titles = [...new Set(group.items.map(line => line.title))];
    if (group.items.length === 1) {
      const title = group.items[0].title;
      if (group.kind === 'material' && /مؤشر مساحي/.test(title)) {
        if (/كهرباء/.test(group.category)) return 'توريد خامات الكهرباء';
        if (/سباكة|صرف/.test(group.category)) return 'توريد خامات السباكة والصرف';
      }
      return title;
    }
    if (group.kind === 'material') return 'توريد الخامات';
    if (group.kind === 'labor') return titles.length === 1 ? titles[0] : 'مصنعية تنفيذ الأعمال';
    if (group.kind === 'equipment') return titles.length === 1 ? titles[0] : 'معدات وتشغيل';
    if (group.kind === 'service') return titles.length === 1 ? titles[0] : 'خدمات ورسوم';
    return titles[0] || 'بند';
  };
  const boqSummary = [...summaryGroups.values()].map((group, index) => {
    const items = group.items;
    const completeItems = items.filter(line => line.hasPrice && line.hasQuantity && line.costValue !== null);
    const partialAmountValue = completeItems.reduce((sum, line) => sum + line.costValue, 0);
    const missingPriceCount = items.filter(line => !line.hasPrice).length;
    const missingQuantityCount = items.filter(line => !line.hasQuantity).length;
    const complete = missingPriceCount === 0 && missingQuantityCount === 0 && completeItems.length === items.length;
    const titles = [...new Set(items.map(line => line.title))];
    const units = [...new Set(items.map(line => line.unit))];
    const canAggregateQuantity = titles.length === 1 && units.length === 1 && items.every(line => line.hasQuantity && line.quantity !== null);
    const qty = canAggregateQuantity ? items.reduce((sum,line) => sum + Number(String(line.quantity).replace(/,/g,'')),0) : null;
    const kindLabel = group.kind === 'material' ? 'توريد خامات' : group.kind === 'labor' ? 'مصنعية' : group.kind === 'equipment' ? 'تنفيذ شامل / معدات' : group.kindLabel;
    return {
      id:`boq-${index+1}`, section:group.section, category:group.category, kind:group.kind,
      kindLabel, title:summaryLabel(group), itemCount:items.length, lineCodes:items.map(line=>line.code),
      quantity:canAggregateQuantity ? numberFmt(qty) : null, unit:canAggregateQuantity ? units[0] : null,
      amount:completeItems.length ? moneyFmt(partialAmountValue) : null,
      amountValue:completeItems.length ? partialAmountValue : null,
      complete, partial:!complete && completeItems.length > 0,
      missingPriceCount, missingQuantityCount, pricedItemCount:completeItems.length,
      sourceLineCount:items.length
    };
  }).sort((a,b)=>workBreakdown.compareLines(a,b));
  const incompletePackageCount = boqSummary.filter(item => !item.complete).length;
  const assumptions = [...new Set(lines.flatMap(l=>[l.assumption,...l.warnings]).filter(Boolean))].slice(0,30);
  const gapHighlights = boqSummary.filter(item=>!item.complete).slice(0,5).map(item => {
    const missing = [];
    if (item.missingPriceCount) missing.push(`${item.missingPriceCount} سعر ناقص`);
    if (item.missingQuantityCount) missing.push(`${item.missingQuantityCount} كمية ناقصة`);
    return `${item.category} — ${missing.join('، ') || 'مراجعة مطلوبة'}`;
  });
  return {
    ready: lines.length > 0, label: readyToShowAmount ? 'قيمة البنود المسعّرة حاليًا' : 'استكمال الأسعار قبل عرض قيمة رئيسية',
    amount: readyToShowAmount ? moneyFmt(baseline) : null, low: readyToShowAmount ? moneyFmt(low) : null, high: readyToShowAmount ? moneyFmt(high) : null,
    perMeter: readyToShowAmount ? moneyFmt(baseline / totalGrossArea) : null,
    coveragePercent: Math.round(coverage*100), quantityCoveragePercent: Math.round(quantityCoverage*100), completeRequiredCoveragePercent: Math.round(completeCoverage*100), readyToShowAmount,
    requiredLineCount: requiredLines.length, pricedRequiredLineCount: pricedRequiredCount, quantifiedRequiredLineCount: quantifiedRequiredCount, completeRequiredLineCount: completeRequiredCount,
    priceGapCount: priceGaps.length, quantityGapCount: quantityGaps.length, totalGapCount: new Set([...priceGaps,...quantityGaps].map(l=>l.code)).size,
    gapHighlights: [...new Set(gapHighlights)].slice(0,5), distribution: stageList, workBreakdown: stageList,
    lineCount: lines.length, summaryLineCount:boqSummary.length, incompletePackageCount,
    pricedLineCount: lines.filter(l => l.priced).length, boqSummary, lines, assumptions,
    project: { type: project.type || 'residential', area: numberFmt(project.area || project.apartmentArea), floors: numberFmt(project.floors || 1), scope: project.scope || 'turnkey', pack: project.pack || project.package || 'medium', rooms: numberFmt(project.rooms || project.roomsPerApartment || 3), bathrooms: numberFmt(project.bathrooms || 2), basement: !!project.basement, elevator: !!project.elevator, kitchen: !!project.kitchen, ac: !!project.ac, location: project.location || null },
    sourceNote: 'تقدير آلي أولي؛ لا يمثل مراجعة هندسية أو اعتمادًا تجاريًا.',
    engineFlags: { hasPriceGaps: priceGaps.length>0, hasQuantityGaps: quantityGaps.length>0, humanReviewRequired: true }
  };
}
function makeEstimate(project, book) {
  if(project.modelCode) {
    const p={...project, package:project.pack||'medium', marginMode:book.marginMode==='supervision'?'supervision':'comprehensive', quoteBasis:project.quoteBasis||'average', apartmentArea:project.apartmentArea||project.area, apartmentCount:project.apartmentCount||1, roomsPerApartment:project.roomsPerApartment||project.rooms||3};
    if(String(project.modelCode).startsWith('BLD-')) p.floors=Array.from({length:Math.max(1,Math.min(40,Number(project.floors||1)))},(_,i)=>({key:`floor-${i+1}`,label:`الدور ${i+1}`,area:Number(project.area||0),units:Number(project.unitsPerFloor||1),usage:project.type==='commercial'?'commercial':'residential'}));
    else p.floors=[];
    const rawModel=models.buildEstimate(p,book.prices,book.settings,p.manualQuantities||{});
    const feeRate=book.marginMode==='supervision'?Number(book.settings.supervision||10):Number(book.settings.margin||15);
    const direct=Number(rawModel.directSubtotal||0);
    const low=rawModel.lines.reduce((sum,l)=>sum+(Number.isFinite(Number(l.costLow))?Number(l.costLow):0),0)*(1+feeRate/100);
    const high=rawModel.lines.reduce((sum,l)=>sum+(Number.isFinite(Number(l.costHigh))?Number(l.costHigh):0),0)*(1+feeRate/100);
    const normalized={...rawModel,lines:rawModel.lines,total:rawModel.totalKnownPartial,totalLow:low,totalHigh:high,project};
    return {raw:rawModel,view:publicEstimate(normalized,project,book)};
  }
  const p = asEngineProject(project, book);
  const raw = engine.buildEstimate(p, book.prices, book.settings, p.manualQuantities || {});
  return {raw, view:publicEstimate(raw, project, book)};
}
function priceLookup(text, book, context = {}) {
  const q = String(text || '').trim().toLocaleLowerCase('ar');
  if (!q) return {found:false, message:'اكتب اسم الخامة أو البند اللي بتسأل عن سعره.'};
  const signals = context && context.pricingSignals;
  const signalOf = r => signals && signals.byId ? signals.byId[String(r && (r.id || r.priceId) || '')] : null;
  const normalize = value => engine.normalizeArabic(value).replace(/ال/g,'').trim();
  const nq = normalize(q);
  const tokens = nq.split(/\s+/).filter(t=>t.length>1);
  const staleDays = Number(book.settings && book.settings.staleDays) || 90;
  const ageDays = date => { const d=date?new Date(String(date)+'T00:00:00Z'):null; return d&&Number.isFinite(d.getTime())?Math.floor((Date.now()-d.getTime())/86400000):null; };
  const staleOf = r => { const a=ageDays(r.date); return a!==null&&a>staleDays; };
  // Synonyms come from the versioned BOQ knowledge base, not scattered inline lists.
  // Related products (e.g. granite vs ceramic, sand vs aggregate) remain separate groups.
  const synonyms = boqKnowledge.synonymTerms(nq, tokens, normalize).map(normalize);
  // Match whole words, not prefixes: \"مط\" is a paint grade but also a prefix
  // of \"مطبخ\", and \"عز\" is a steel brand but also a prefix of \"عزل\".
  const wordsOf = value => String(value || '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const termIn = (haystack, term) => term.includes(' ') ? haystack.includes(term) : wordsOf(haystack).includes(term);
  const tokenHit = (haystack, term) => termIn(haystack, term) || (term.length >= 4 && haystack.includes(term));
  const scored = book.prices.filter(r=>r.active!==false).map(r=>{
    const name=normalize(r.name);
    const aliases=(Array.isArray(r.aliases)?r.aliases:[]).map(normalize);
    const category=normalize(r.category||'');
    const nameScore=name===nq?100:name.includes(nq)?60:aliases.some(a=>a===nq)?90:aliases.some(a=>a.includes(nq))?50:0;
    const tokenScore=tokens.reduce((s,t)=>s+(tokenHit(name,t)?7:aliases.some(a=>tokenHit(a,t))?5:tokenHit(category,t)?2:0),0);
    const synonymScore=synonyms.some(s=>termIn(name,s)||aliases.some(a=>termIn(a,s)))?70:0;
    // \"دهان/بلاستيك\" usually means the finish coat (مط), not the preparation
    // coat (معجون/برايمر). Give the finish coat a small deterministic edge.
    const paintBoost=(nq==='دهان'||nq==='دهانات'||nq==='بلاستيك')&&(termIn(name,'مط')||name.startsWith('نصف مط '))?10:0;
    return {r,score:nameScore+tokenScore+synonymScore+paintBoost,syn:synonymScore>0,text:name+' '+aliases.join(' ')+' '+category};
  }).filter(x=>x.score>0);
  // A concrete size (\"4 بوصة\", \"12 مم\", \"1.5 مم²\") is a hard filter in
  // practice; otherwise 2\" and 3\" pipes would outrank the requested 4\" pipe
  // simply because their names are shorter. Fall back if nothing carries it.
  const sizeMatch = nq.match(/(\d+(?:\.\d+)?)\s*(?:بوصه|مم|سم|متر|م|طن|كجم|كيلو|لتر)/);
  const size = sizeMatch ? sizeMatch[1] : null;
  const materialTokens = tokens.filter(t=>!/^\d+(?:\.\d+)?$/.test(t));
  const withSize = size ? scored.filter(x => normalize(x.r.name).split(/\s+/).includes(size) && (!materialTokens.length || materialTokens.some(t=>x.text.includes(t)))) : [];
  const relevance = (a,b)=>{
    if(b.score!==a.score) return b.score-a.score;
    const ma=a.r.status==='missing'?1:0, mb=b.r.status==='missing'?1:0;
    if(ma!==mb) return ma-mb;
    // Learned evidence is a tie-breaker only: it can prefer a better-supported
    // equal match, never outrank a clearly more relevant name.
    const la=pricingMemory.rankScore(signalOf(a.r)), lb=pricingMemory.rankScore(signalOf(b.r));
    if(la!==lb) return lb-la;
    const sa=staleOf(a.r), sb=staleOf(b.r);
    if(sa!==sb) return sa?1:-1;
    return String(b.r.date||'').localeCompare(String(a.r.date||''));
  };
  let ranked = (withSize.length ? withSize : scored).sort(relevance);
  // A synonym hit must not disappear behind five literal name matches (e.g.
  // \"جبس بورد\" would otherwise hide the bulletin row \"ألواح جبسية\").
  if(synonyms.length && !size && !ranked.slice(0,5).some(x=>x.syn)){
    const alt=scored.filter(x=>x.syn).sort(relevance)[0];
    if(alt&&!ranked.slice(0,5).includes(alt)) ranked=ranked.slice(0,4).concat(alt);
  }
  ranked=ranked.slice(0,5);
  if(!ranked.length)return {found:false,message:'مالقيتش بند مطابق بالاسم ده في الكتالوج الحالي. ممكن تكتب الاسم أو المواصفة بشكل مختلف؟'};
  const hasSize=/\d/.test(q);
  const variantCount=ranked.filter(x=>/\d/.test(x.r.name)).length;
  const message=!hasSize&&variantCount>1?'في أكثر من مقاس/نوع مطابق. حدد المقاس أو النوع أو المواصفة للحصول على سعر أدق.':undefined;
  return {found:true,message,results:ranked.map(({r})=>{
    const age=ageDays(r.date), stale=age!==null&&age>staleDays;
    const bulletinQuotes=Array.isArray(r.bulletinQuotes)?r.bulletinQuotes:[];
    // Labor quotes that equal the active price would duplicate the card. Only
    // surface labor quotes that add information: derived bridges, comparison
    // quotes, and explicit unit mismatches.
    const laborQuotes=(Array.isArray(r.laborQuotes)?r.laborQuotes:[]).filter(q=>q&&q.avg!=null&&(q.derived||q.comparison||q.unitMismatch));
    const quotes=[...bulletinQuotes,...laborQuotes].filter(q=>q&&q.avg!=null).slice(0,6).map(q=>({
      name:String(q.name||''), unit:String(q.unit||'—'), price:moneyFmt(q.avg), low:moneyFmt(q.low), high:moneyFmt(q.high),
      date:String(q.date||''), source:String(q.source||''), transport:String(q.transport||'unknown'),
      label:q.batch==='labor-2026-10'?'قائمة مصنعيات 2026-10-21':(q.bulletin==='jan-2026'?'نشرة يناير 2026':'اقتباس سعر'),
      labor:!!q.laborOnly||q.batch==='labor-2026-10',
      derived:!!q.derived, comparison:!!q.comparison, unitMismatch:!!q.unitMismatch, note:String(q.note||'')
    }));
    const note=r.status==='missing'?'السعر غير مدخل في الكتالوج الحالي.':stale?`سعر وطني قديم (${age} يوم) ويحتاج تأكيدًا محليًا.`:r.status==='national'?'بديل وطني وليس عرضًا محليًا موثقًا للأقصر.':'';
    const item={
      priceId:String(r.id||''), name:String(r.name), unit:String(r.unit||'—'),
      price:r.status==='missing'||r.avg==null?null:moneyFmt(r.avg),
      low:r.status==='missing'||r.low==null?null:moneyFmt(r.low),
      high:r.status==='missing'||r.high==null?null:moneyFmt(r.high),
      status:String(r.status||'missing'), source:String(r.source||''), date:String(r.date||''),
      transport:String(r.transport||'unknown'), stale, ageDays:age, note,
      workPackage:String(r.workPackage||''), tradeCode:String(r.tradeCode||''),
      itemKind:String(r.itemKind||''), priceScope:String(r.priceScope||''),
      includes:Array.isArray(r.includes)?r.includes.map(String):undefined,
      excludes:Array.isArray(r.excludes)?r.excludes.map(String):undefined,
      engineerReview:String(r.engineerReview||''), bulletinQuotes:quotes.length?quotes:undefined
    };
    return pricingMemory.annotateLookupResult(item, signals);
  })};
}
function takeoffView(project, book) {
  const floorSpecs = Array.from({length: Math.max(1,Math.min(40,Number(project.floors||1)))},(_,i)=>({key:`floor-${i+1}`,label:`الدور ${i+1}`,area:Number(project.area||0),apartmentCount:Number(project.unitsPerFloor||1),units:Number(project.unitsPerFloor||1),rooms:Number(project.rooms||3),bathrooms:Number(project.bathrooms||2)}));
  const raw = takeoff.buildMaterialTakeoff({
    modelCode: project.modelCode || (project.type==='residential' ? 'APT-BRICK' : 'BLD-NEW-RES'),
    scope:project.scope||'turnkey', package: project.pack || 'medium', basement:!!project.basement, elevator:!!project.elevator,
    kitchen:!!project.kitchen, ac:!!project.ac, apartmentArea:Number(project.area||0), apartmentCount:1,
    roomsPerApartment:Number(project.rooms||3), bathrooms:Number(project.bathrooms||2),
    concreteGrade:project.concreteGrade||'C25', steelName:project.steelChoice||'حديد استثماري'
  }, floorSpecs, book.prices, book.settings, project.manualQuantities || {});
  return {
    totalFloorArea: numberFmt(raw.totalFloorArea), priceCoverage: numberFmt(raw.priceCoverage,0), quantityCoverage: numberFmt(raw.quantityCoverage,0),
    lines: (raw.lines||[]).slice(0,300).map(lineVM),
    priceGaps:(raw.priceGaps||[]).slice(0,30).map(lineVM), quantityGaps:(raw.quantityGaps||[]).slice(0,30).map(lineVM),
    notes:(raw.notes||[]).map(String)
  };
}
function assumptions(project) {
  const items=[];
  if(project.area)items.push(`المساحة المسجلة: ${numberFmt(project.area)} م² للدور.`);
  if(project.floors)items.push(`عدد الأدوار المسجل: ${numberFmt(project.floors)}.`);
  if(project.pack)items.push(`باقة التشطيب المختارة: ${{economic:'اقتصادي',semi:'نصف تشطيب',medium:'متوسط',luxury:'فاخر'}[project.pack]}.`);
  if(project.scope)items.push(`النطاق: ${{structure:'هيكل فقط',finishing:'تشطيب فقط',turnkey:'على المفتاح'}[project.scope]}.`);
  if(project.basement)items.push('وجود بدروم مفعل؛ يلزم حصر العناصر والأساسات من الرسومات.');
  items.push('معدلات المساحة مؤشر تخطيطي ولا تحل محل الحصر من الرسومات.');
  items.push('أي سعر بديل وطني أو قديم أو لا يشمل النقل يبقى بحاجة إلى تحقق محلي.');
  items.push('المراجعة الهندسية البشرية لم تتم تلقائيًا.');
  return {items};
}

// Adds evidence-quality annotations without touching quantities, prices, or
// totals. The public view never includes unpublished suggestions.
function withEstimateIntelligence(view, context = {}) {
  const signals = context && context.pricingSignals;
  if (!signals) return view;
  const intel = pricingMemory.estimateIntelligence(view, signals);
  if (!intel) return view;
  const { lines, ...summary } = intel;
  return {
    ...view,
    lines,
    assumptions: [...summary.notes, ...(Array.isArray(view.assumptions) ? view.assumptions : [])].filter(Boolean).slice(0, 30),
    pricingIntelligence: summary
  };
}

function handleTool(payload, bookOverride = null, context = {}) {
  const allowedTop = new Set(['tool','state','args','sessionId']);
  validateKeys(payload, allowedTop, 'request');
  if (!TOOLS.has(payload.tool)) throw new Error('Unknown tool.');
  const book = loadBook(bookOverride);
  const state = validateProject(payload.state || {});
  const args = payload.args || {};
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('args must be an object.');
  let data;
  switch(payload.tool) {
    case 'conversation.extract': {
      validateKeys(args,new Set(['message','pending']),'args');
      if(typeof args.message!=='string'||args.message.length>2000)throw new Error('message must be text of at most 2000 characters.');
      if(args.pending!==undefined&&args.pending!==null&&!['area','floors','rooms','bathrooms','package','scope','material'].includes(args.pending))throw new Error('pending is not a supported field.');
      const parsed=conversation.infer(args.message,args.pending,state);
      const values={};
      for(const [key,value] of Object.entries(parsed.values||{})) if(PROJECT_KEYS.has(key) && value!==undefined) values[key]=value;
      data={values,found:(parsed.found||[]).map(String),normalized:String(parsed.normalized||''),intent:parsed.intent,query:parsed.query,unmatched:!!parsed.unmatched,matchedMaterial:parsed.matchedMaterial};
      break;
    }
    case 'conversation.plan': {
      validateKeys(args,new Set(['message','pending','history']),'args');
      if(typeof args.message!=='string'||args.message.length>2000)throw new Error('message must be text of at most 2000 characters.');
      if(args.pending!==undefined&&args.pending!==null&&!['area','floors','rooms','bathrooms','package','scope','material','options','unitDetails'].includes(args.pending))throw new Error('pending is not a supported field.');
      if(args.history!==undefined&&(!Array.isArray(args.history)||args.history.length>10||args.history.some(h=>typeof h!=='string'||h.length>300)))throw new Error('history must be an array of at most 10 short strings.');
      const parsed=conversation.infer(args.message,args.pending,state);
      const smartValues={};
      for(const [key,value] of Object.entries(parsed.values||{})) if(PROJECT_KEYS.has(key) && value!==undefined) smartValues[key]=value;
      // Prior user turns are re-parsed deterministically so the context layer can
      // resolve focus ("خليها 250"), undo ("بلاش") and reuse ("نفس اللي فات")
      // without storing a server-side conversation session.
      const historyFacts=Array.isArray(args.history)?args.history.map(entry=>{const h=conversation.infer(entry,null,{});return {text:entry,values:h.values,intent:h.intent};}):[];
      const plan=agent.planConversation({parsed:{...parsed,values:smartValues},state,pending:args.pending||null,history:historyFacts,message:args.message});
      const planValues={};
      for(const [key,value] of Object.entries(plan.values||{})) if(PROJECT_KEYS.has(key)&&value!==undefined) planValues[key]=value;
      data={values:planValues,found:(plan.found||parsed.found||[]).map(String).slice(0,6),normalized:String(parsed.normalized||''),intent:parsed.intent,query:parsed.query,unmatched:!plan.handled&&!!parsed.unmatched,matchedMaterial:parsed.matchedMaterial,needsConfirmation:plan.needsConfirmation||parsed.needsConfirmation||[],lexiconVersion:parsed.lexiconVersion||null,plan};
      break;
    }
    case 'estimate.run': {
      validateKeys(args,new Set(['overrides']),'args');
      const p={...state};
      if(args.overrides!==undefined){validateManualQuantities(args.overrides);p.manualQuantities={...p.manualQuantities,...args.overrides};}
      const result=makeEstimate(p,book);
      result.view=withEstimateIntelligence(result.view,context);
      const workflowPlan=workflow.plan({...p,modelCode:p.modelCode||(p.service==='apartment'?'APT-BRICK':p.scope==='structure'?'BLD-STRUCTURE':'BLD-NEW-RES'),projectKind:p.service==='building'?'building':'apartment',scope:p.scope},{estimate:{priceGaps:result.view.lines.filter(l=>l.required&&!l.hasPrice),quantityGaps:result.view.lines.filter(l=>l.required&&!l.hasQuantity)}});
      data={estimateId:crypto.randomUUID(),priceBookVersion:book.version,estimate:result.view,workflow:{stages:workflowPlan.stages.map(s=>({key:s.key,label:s.label,complete:s.complete})),currentStage:workflowPlan.currentStage,progressPercent:workflowPlan.progressPercent,action:workflowPlan.action?.type||'review'}};
      break;
    }
    case 'package.compare': {
      validateKeys(args,new Set(['packages']),'args');
      const packages=args.packages===undefined?PACKAGES:args.packages;
      if(!Array.isArray(packages)||packages.length<2||packages.length>4||packages.some(x=>!PACKAGES.includes(x)))throw new Error('packages must contain 2–4 known packages.');
      const rows=packages.map(pack=>{const r=makeEstimate({...state,pack},book).view;return {pack,label:{economic:'اقتصادي',semi:'نصف تشطيب',medium:'متوسط',luxury:'فاخر'}[pack],amount:r.amount,low:r.low,high:r.high,coveragePercent:r.coveragePercent,readyToShowAmount:r.readyToShowAmount,priceGapCount:r.priceGapCount,quantityGapCount:r.quantityGapCount};});
      data={priceBookVersion:book.version,packages:rows};break;
    }
    case 'boq.explain': {
      validateKeys(args,new Set(['code']),'args');
      if(typeof args.code!=='string'||!/^.{1,40}$/.test(args.code))throw new Error('code is required.');
      const {view}=makeEstimate(state,book);const smartView=withEstimateIntelligence(view,context);const line=smartView.lines.find(l=>l.code===args.code);
      if(!line) throw new Error('لم أجد هذا البند في المقايسة الحالية.');
      const explanation=explainer.explainLine(line);
      const purchaseBasis = Number(line.wastePercent)>0 ? `${line.quantity} ${line.unit} صافي + ${line.wastePercent}% هالك = ${line.billableQuantity||'كمية التوريد غير متاحة'} ${line.unit} للتوريد` : `${line.quantity} ${line.unit}`;
      data={priceBookVersion:book.version,line,formula:line.priced&&line.quantity!==null?`${purchaseBasis} × ${line.unitPrice} للوحدة`:'لا يمكن تكوين معادلة تكلفة مكتملة لأن السعر أو الكمية ناقصان.',details:[line.assumption,...line.warnings].filter(Boolean),priceStatus:line.status,source:line.source,date:line.date,narrative:explanation.narrative,quantityStory:explanation.quantityStory,priceStory:explanation.priceStory,costStory:explanation.costStory};break;
    }
    case 'price-catalog.search': {
      validateKeys(args,new Set(['query']),'args');
      if(typeof args.query!=='string'||args.query.length>160)throw new Error('query must be at most 160 characters.');
      data={priceBookVersion:book.version,...priceLookup(args.query,book,context)};break;
    }
    case 'resource.takeoff': {
      validateKeys(args,new Set(['overrides']),'args');
      if(args.overrides!==undefined)validateManualQuantities(args.overrides);
      data={priceBookVersion:book.version,...takeoffView({...state,...(args.overrides?{manualQuantities:args.overrides}:{})},book)};break;
    }
    case 'price-catalog.audit': {
      validateKeys(args,new Set([]),'args');
      const raw=engine.auditCatalog(book.prices,book.settings);
      data={priceBookVersion:book.version,total:raw.total,priced:raw.priced,missing:raw.missing,local:raw.local,national:raw.national,estimate:raw.estimate,stale:raw.stale,coveragePercent:book.prices.filter(r=>r.active!==false).length?Math.round(raw.priced/book.prices.filter(r=>r.active!==false).length*100):0,byDivision:(raw.byDivision||[]).map(d=>({code:String(d.code||''),name:String(d.name||''),total:Number(d.total||0),priced:Number(d.priced||0),missing:Number(d.missing||0)}))};break;
    }
    case 'scenario.evaluate': {
      validateKeys(args,new Set(['changes','approve']),'args');
      if(!args.changes||typeof args.changes!=='object'||Array.isArray(args.changes))throw new Error('changes must be an object.');
      const changes=validateProject(args.changes);
      const before=withEstimateIntelligence(makeEstimate(state,book).view,context);const after=withEstimateIntelligence(makeEstimate({...state,...changes},book).view,context);
      data={priceBookVersion:book.version,approved:args.approve===true,changeSummary:Object.keys(changes).map(k=>`${k}: ${String(changes[k])}`),before:{amount:before.amount,low:before.low,high:before.high,coveragePercent:before.coveragePercent},after:{amount:after.amount,low:after.low,high:after.high,coveragePercent:after.coveragePercent,priceGapCount:after.priceGapCount,quantityGapCount:after.quantityGapCount},estimate:after};break;
    }
    case 'project.assumptions': {
      validateKeys(args,new Set([]),'args'); data=assumptions(state);break;
    }
  }
  return {ok:true,tool:payload.tool,sessionId:String(payload.sessionId||'').slice(0,100),estimateId:data.estimateId||crypto.randomUUID(),priceBookVersion:book.version,...data};
}
module.exports={handleTool,loadBook,validateProject,validateManualQuantities,lineVM,publicEstimate,numberFmt,moneyFmt,TOOLS};
