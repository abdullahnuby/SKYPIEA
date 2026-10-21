'use strict';
const fs = require('node:fs');
const path = require('node:path');
const file = path.resolve(__dirname, '../_data/boq-knowledge.v1.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

function normalize(value) {
  return String(value || '').normalize('NFKD').replace(/[\u064b-\u065f\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ـ/g, '')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
function synonymTerms(query, tokens = [], normalizer = normalize) {
  const q = normalizer(query);
  const normalizedTokens = (tokens || []).map(normalizer).filter(Boolean);
  const groups = data.materialSynonyms || [];
  const exact = groups.filter(group => [group.query, ...(group.terms || [])].some(term => normalizer(term) === q));
  const tokenMatches = groups.filter(group => [group.query, ...(group.terms || [])].some(term => normalizedTokens.includes(normalizer(term))));
  const matching = exact.length ? exact : tokenMatches;
  const out = new Set();
  for (const group of matching) {
    for (const term of [group.query, ...(group.terms || [])]) {
      const n = normalizer(term);
      if (n && n !== q && !normalizedTokens.includes(n)) out.add(term);
    }
  }
  return [...out];
}
function getWorkPackage(key) { return (data.workPackages || []).find(group => group.key === key) || null; }
function normalizeCategory(value) {
  const n = normalize(value);
  for (const [from, to] of Object.entries(data.taxonomyMappings || {})) if (normalize(from) === n) return to;
  return value;
}
function duplicateAudit(prices) {
  const active = (prices || []).filter(row => row && row.active !== false && row.searchable !== false);
  const groups = new Map();
  for (const row of active) {
    const key = [normalize(row.name), normalize(row.unit), normalize(row.priceScope || ''), String(row.avg ?? '')].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row.id);
  }
  return [...groups.entries()].filter(([, ids]) => ids.length > 1).map(([key, ids]) => ({key, ids}));
}
module.exports = { data, normalize, synonymTerms, getWorkPackage, normalizeCategory, duplicateAudit };
