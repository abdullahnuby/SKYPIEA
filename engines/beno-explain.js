(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BENO_EXPLAIN = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Deterministic, engineer-facing explanation. All quantities, prices, dates,
  // and scope notes must come from the line view model; never infer missing data.
  const STATUS_STORIES = {
    local: 'سعر محلي مسجّل',
    national: 'بديل وطني، وليس عرض سعر محليًا مؤكّدًا',
    estimate: 'سعر استرشادي؛ يلزم تأكيده من المورد',
    stale: 'السعر قديم أو غير مؤرخ؛ يلزم تحديثه',
    missing: 'السعر غير متاح في الكتالوج الحالي'
  };

  function quantityStory(line) {
    if (!line.hasQuantity || line.quantity === null || line.quantity === undefined) {
      return 'الكمية غير محددة. أدخلها من الحصر أو الرسومات؛ المحرك ما يخمّنش الكميات من مساحة المبنى وحدها.';
    }
    const basis = line.quantitySource ? ` الأساس: ${line.quantitySource}.` : '';
    const parts = [`الكمية الصافية: ${line.quantity} ${line.unit || ''}.`];
    if (Number(line.wastePercent) > 0) {
      if (line.billableQuantity !== null && line.billableQuantity !== undefined) {
        parts.push(`كمية التوريد بعد هالك ${line.wastePercent}%: ${line.billableQuantity} ${line.unit || ''}.`);
      } else {
        parts.push(`هالك التوريد المحدد ${line.wastePercent}%، لكن كمية الشراء غير محسوبة.`);
      }
      parts.push('الهالك على التوريد فقط، وليس على المصنعية.');
    }
    if (basis) parts.push(basis.trim());
    return parts.join(' ');
  }

  function priceStory(line) {
    const status = STATUS_STORIES[line.status] || (line.hasPrice ? 'حالة السعر تحتاج مراجعة' : STATUS_STORIES.missing);
    const story = [status + '.'];
    if (line.hasPrice) {
      if (line.unitPrice) story.push(`سعر الوحدة: ${line.unitPrice}${line.unit ? '/' + line.unit : ''}.`);
      if (line.lowUnitPrice && line.highUnitPrice && line.lowUnitPrice !== line.highUnitPrice) {
        story.push(`النطاق المسجّل: ${line.lowUnitPrice} إلى ${line.highUnitPrice}.`);
      }
      if (line.source || line.date) {
        story.push(`المصدر: ${line.source || 'غير مسجل'}${line.date ? ' — التاريخ: ' + line.date : ' — التاريخ غير مسجل'}.`);
      }
      if (line.transport === 'unknown') story.push('شمول النقل غير معروف؛ تأكد هل السعر واصل للموقع أم من المخزن فقط.');
      else if (line.transport === 'excluded') story.push('النقل غير شامل في السعر المسجّل.');
      else if (line.transport === 'included') story.push('النقل مشمول وفق بيانات السعر المسجّلة.');
    } else {
      story.push('أدخل عرض سعر مطابقًا لنفس الوحدة ونطاق الشمول من مورد أو مقاول قبل اعتماد التكلفة.');
    }
    return story.join(' ');
  }

  function costStory(line) {
    if (!line.priced || line.cost === null || line.cost === undefined) {
      if (line.hasQuantity && !line.hasPrice) return 'الكمية موجودة لكن السعر ناقص؛ التكلفة غير محسوبة والبند لا يدخل كتكلفة مكتملة.';
      if (line.hasPrice && !line.hasQuantity) return 'السعر موجود لكن الكمية غير معتمدة؛ لا يمكن حساب تكلفة البند كاملة.';
      return 'ما فيهش تكلفة محسوبة لأن السعر أو الكمية أو كلاهما ناقص.';
    }
    if (line.lowCost && line.highCost && line.lowCost !== line.highCost) {
      return `تكلفة البند: من ${line.lowCost} إلى ${line.highCost}، والمتوسط ${line.cost}.`;
    }
    return `تكلفة البند: ${line.cost}.`;
  }

  function explainLine(line) {
    if (!line || typeof line !== 'object') throw new Error('explainLine needs a line view model.');
    const heading = `المرحلة: ${line.section || 'غير محددة'} | مجموعة العمل: ${line.category || 'غير مصنفة'} | البند: ${line.title || 'بند غير محدد'}`;
    const kind = line.kindLabel ? `النوع: ${line.kindLabel}.` : '';
    const scope = line.assumption ? `نطاق/أساس البند: ${line.assumption}.` : '';
    const quantity = quantityStory(line);
    const price = priceStory(line);
    const cost = costStory(line);
    const warnings = Array.isArray(line.warnings) && line.warnings.length
      ? 'ملاحظات: ' + line.warnings.join('؛ ') + '.'
      : '';
    const narrative = [heading, kind, scope, quantity, price, cost, warnings].filter(Boolean).join('\n');
    return { narrative, quantityStory: quantity, priceStory: price, costStory: cost, scopeStory: scope };
  }

  function explainEstimate(view, project) {
    if (!view || typeof view !== 'object') throw new Error('explainEstimate needs an estimate view.');
    const opts = project || {};
    const lines = Array.isArray(view.lines) ? view.lines : [];
    const priceGaps = lines.filter(l => l.required && !l.hasPrice);
    const quantityGaps = lines.filter(l => l.required && !l.hasQuantity);
    const coverageValue = typeof view.coveragePercent === 'number' ? view.coveragePercent : null;
    const coveragePercent = coverageValue === null ? null : Math.round(coverageValue <= 1 ? coverageValue * 100 : coverageValue);
    const area = Number(opts.area || opts.apartmentArea || 0);
    const narrative = [];
    narrative.push('دي مقايسة أولية' + (area ? ` لمساحة ${area} م²` : '') + '. الكميات النموذجية لازم تتراجع على الرسومات.');
    if (coveragePercent !== null) narrative.push(`تغطية الأسعار: ${coveragePercent}% من البنود المطلوبة؛ وده مش معناه إن المقايسة مكتملة.`);
    if (priceGaps.length || quantityGaps.length) {
      narrative.push(`في ${priceGaps.length} بند سعره ناقص و${quantityGaps.length} بند كميته ناقصة. القيمة الظاهرة — إن وُجدت — جزئية وليست إجمالي المشروع.`);
    } else {
      narrative.push('كل البنود المطلوبة لها سعر وكمية في البيانات الحالية؛ الاعتماد النهائي يحتاج مراجعة هندسية بشرية للرسومات ونطاق الشمول والنقل والضرائب.');
    }
    if (!view.readyToShowAmount) narrative.push('لن أعرض قيمة رئيسية قبل استكمال فجوات السعر والكمية المطلوبة.');
    if (priceGaps.length) narrative.push('أبرز أسعار ناقصة: ' + priceGaps.slice(0, 4).map(l => l.title).join('، ') + '.');
    if (quantityGaps.length) narrative.push('أبرز كميات ناقصة: ' + quantityGaps.slice(0, 4).map(l => l.title).join('، ') + '.');
    return {
      narrative: narrative.join('\n'),
      priceGaps: priceGaps.slice(0, 6).map(l => ({ code: l.code, title: l.title })),
      quantityGaps: quantityGaps.slice(0, 6).map(l => ({ code: l.code, title: l.title })),
      coveragePercent
    };
  }

  function explainGapSummary(view) {
    const lines = Array.isArray(view && view.lines) ? view.lines : [];
    const priceGaps = lines.filter(l => l.required && !l.hasPrice);
    const quantityGaps = lines.filter(l => l.required && !l.hasQuantity);
    if (!priceGaps.length && !quantityGaps.length) {
      return { narrative: 'لا توجد فجوات سعر أو كمية مسجلة في البيانات الحالية، لكن الاعتماد النهائي يحتاج مراجعة هندسية بشرية للرسومات ونطاق الشمول.' };
    }
    const byCategory = {};
    for (const l of [...priceGaps, ...quantityGaps]) {
      const k = (l.section || 'مرحلة غير محددة') + ' ← ' + (l.category || 'مجموعة غير محددة');
      byCategory[k] = byCategory[k] || { count: 0, titles: [] };
      byCategory[k].count++;
      if (byCategory[k].titles.length < 3 && !byCategory[k].titles.includes(l.title)) byCategory[k].titles.push(l.title);
    }
    const parts = Object.entries(byCategory).map(([k, v]) => `${k}: ${v.count} بند (${v.titles.join('، ')})`);
    return { narrative: 'الفجوات حسب المرحلة ومجموعة العمل:\n' + parts.join('\n'), categories: byCategory };
  }

  return { explainLine, explainEstimate, explainGapSummary, STATUS_STORIES };
});
