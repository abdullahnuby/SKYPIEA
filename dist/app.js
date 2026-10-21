(() => {
  'use strict';

  const PHONE_DISPLAY = '01550130114';
  const WHATSAPP_NUMBER = '201550130114';
  let language = 'ar';

  const icons = {
    arrow: '<path d="M5 12h14M13 5l7 7-7 7"/>',
    chat: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    layers: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
    calculator: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2m4 0h2M8 16h2m4 0h2"/>',
    ruler: '<path d="M21.3 8.7 15.3 2.7a2.4 2.4 0 0 0-3.4 0L2.7 11.9a2.4 2.4 0 0 0 0 3.4l6 6a2.4 2.4 0 0 0 3.4 0l9.2-9.2a2.4 2.4 0 0 0 0-3.4Z"/><path d="m7.5 9.5 2 2m1-5 2 2m1-5 2 2m-1 8 2 2"/>',
    shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
    spark: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/>',
    cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4.5 7.7 7.5 4.2 7.5-4.2M12 12v9"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    message: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8M8 13h5"/>',
    quote: '<path d="M3 21c3-2 5-5 5-10V5H2v7h4m12 9c3-2 5-5 5-10V5h-6v7h4"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 11.2 19a19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 8.9a16 16 0 0 0 6 6l1.2-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.8 2.1Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
  };

  function icon(name, size = 20) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.spark}</svg>`;
  }

  const copy = {
    ar: {
      navFeatures: 'إمكانيات Beno', navExample: 'مثال للتقدير', navFaq: 'أسئلة شائعة', navCta: 'احسب مع Beno', language: 'EN',
      eyebrow: 'مساعد التسعير الهندسي من SKYPIEA', titleA: 'قبل ما تبدأ البناء،', titleB: 'خلّي Beno يحسبهالك.',
      desc: 'احكي عن مشروعك بطريقتك. Beno يساعدك في تكوين تقدير مبدئي، ينظم البنود، يفصل الخامات عن المصنعية، ويظهر لك النواقص بدل ما يخمّن أرقام.',
      ctaPrimary: 'خلّي Beno يحسبلك', ctaSecondary: 'شوف Beno بيشتغل إزاي', note: 'ابدأ بالمعلومات اللي عندك — مش لازم تكون مجهّز كل التفاصيل.',
      visualCaption: 'مثال توضيحي — مش أسعار فعلية', online: 'جاهز يبدأ معاك', sampleUser: 'عايز أقدّر تكلفة مبنى جديد.', sampleBeno: 'تمام. نبدأ بالبيانات المتاحة، ونحدد الناقص قبل ما نعرض رقم مضلل.', estimatePreview: 'شكل التقدير اللي هتراجعه', stage1: 'الحفر والردم', stage2: 'الخرسانة المسلحة', stage3: 'المباني والمحارة', stage4: 'التشطيبات', statusData: 'يتحدد حسب بيانات مشروعك', previewCta: 'ابدأ تقدير مشروعك',
      strip1: 'بند واضح بدل زحمة أسطر', strip2: 'خامات ومصنعيات منفصلة', strip3: 'نواقص وافتراضات ظاهرة', strip4: 'تقدر تراجع وتعدّل',
      featureEyebrow: 'إيه اللي يميّز Beno؟', featureTitleA: 'مش مجرد شات،', featureTitleB: 'ده مساعد للتقدير الهندسي.', featureDesc: 'Beno مصمم يساعدك ترتّب فكرة المشروع في صورة تقدير قابل للمراجعة، مش يديك رقم وخلاص.',
      f1Title: 'يفهم وصفك الطبيعي', f1Text: 'ابدأ بسؤالك زي ما بتتكلم مع مهندس، وكمّل بالمعلومات المتاحة عندك.',
      f2Title: 'ينظّم بنود المقايسة', f2Text: 'يجمع الخامات الصغيرة داخل مجموعة شغلها، مع إبقاء التفاصيل متاحة وقت المراجعة.',
      f3Title: 'يفصل الخامات عن المصنعية', f3Text: 'تقدر تشوف تكلفة التوريدات لوحدها والمصنعيات لوحدها بدل ما تختلط عليك.',
      f4Title: 'ما يغطّيش على الناقص', f4Text: 'لو سعر أو كمية أساسية ناقصة، يوضحها بدل ما يختلق رقم نهائي بثقة زائفة.',
      featureCta: 'جرّب ده مع Beno',
      tryEyebrow: 'ابدأ من سؤالك', tryTitleA: 'مش لازم تعرف تبدأ منين.', tryTitleB: 'اختار أقرب سؤال ليك.', tryDesc: 'كل اختيار هيفتح نفس المحادثة مع Beno ويجهّز لك بداية مناسبة — من غير تسجيل أو فلو منفصل.',
      try1Tag: 'تشطيب', try1Title: 'عايز أقدّر تكلفة شقة', try1Text: 'ابدأ من المساحة ومستوى التشطيب والتفاصيل المتاحة.',
      try2Tag: 'مبنى جديد', try2Title: 'عايز أقدّر تكلفة عمارة', try2Text: 'حدد مساحة الدور وعدد الأدوار ونطاق الأعمال.',
      try3Tag: 'سعر بند', try3Title: 'عايز أعرف سعر خامة أو بند', try3Text: 'اسأل عن خامة أو بند، وراجع الوحدة ومصدر السعر وتاريخه.',
      tryAction: 'ابدأ مع Beno',
      howEyebrow: 'ببساطة', howTitleA: 'إنت تتكلم.', howTitleB: 'Beno يرتّب الحساب.',
      how1Title: 'احكي اللي تعرفه', how1Text: 'نوع المشروع ومساحته أو سؤالك عن بند — أي معلومة بداية مفيدة.',
      how2Title: 'Beno يسأل عن المهم', how2Text: 'لو معلومة مؤثرة ناقصة، يطلب توضيحها بدل ما يفترضها من عنده.',
      how3Title: 'راجع النتيجة براحتك', how3Text: 'شوف البنود الرئيسية وافتح تفاصيل الخامات والكميات وعدّل ما يحتاج مراجعة.',
      transparencyEyebrow: 'تقدير واضح مش وعود', transparencyTitleA: 'الرقم المفيد،', transparencyTitleB: 'هو الرقم اللي تعرف أساسه.',
      transparencyText: 'Beno يقدّم تقديرًا مبدئيًا اعتمادًا على البيانات المتاحة في محرك الحساب وكتالوج الأسعار. النتائج ليست مقايسة تنفيذية معتمدة، والأسعار المحلية والكميات تحتاج مراجعة حسب المشروع.',
      trans1: 'وحدة القياس واضحة', trans2: 'مصدر السعر وتاريخه عند توفرهما', trans3: 'الكميات قابلة للمراجعة', trans4: 'الفجوات تظهر بدل التخمين',
      transparencyCta: 'ابدأ تقدير مبدئي',
      faqEyebrow: 'أسئلة شائعة', faqTitleA: 'قبل ما تبدأ مع', faqTitleB: 'Beno',
      q1: 'هل لازم أجهّز كل بيانات المشروع؟', a1: 'لأ. ابدأ بالمعلومات المتاحة، وBeno هيسألك عن التفاصيل الأساسية اللي يحتاجها للحساب. لو البيانات غير كافية، هيوضح ده.',
      q2: 'هل الرقم الناتج سعر تنفيذ نهائي؟', a2: 'لا. ده تقدير مبدئي يساعدك في تكوين صورة أولية. الاعتماد النهائي يتطلب مراجعة الرسومات والكميات والأسعار المحلية والمواصفات بواسطة مهندس.',
      q3: 'هل أقدر أغيّر الكميات؟', a3: 'أيوه، تفاصيل المقايسة تتيح مراجعة الكميات وتعديلها وإعادة الحساب قبل استخدام النتيجة.',
      q4: 'ماذا لو سعر بند غير موجود؟', a4: 'Beno يعلن عن فجوة السعر بدل ما يستبدلها بسعر بند آخر أو يخفيها داخل إجمالي غير موثوق.',
      finalEyebrow: 'ابدأ بسؤال واحد', finalTitleA: 'عندك مشروع في بالك؟', finalTitleB: 'خلّي Beno يبدأ معاك.', finalText: 'مش محتاج تسجّل حساب أو تملأ نموذج طويل. افتح المحادثة واحكي له عايز تحسب إيه.', finalCta: 'اتكلم مع Beno واحسب',
      footerText: 'مساعد التسعير الهندسي — تقديرات أولية قابلة للمراجعة.', footerCall: 'تواصل مع مهندس', rights: 'جميع الحقوق محفوظة.', disclaimer: 'Beno لا يستبدل مراجعة المهندس أو الرسومات والمواصفات المعتمدة.'
    },
    en: {
      navFeatures: 'What Beno does', navExample: 'Example estimate', navFaq: 'FAQ', navCta: 'Estimate with Beno', language: 'العربية',
      eyebrow: 'Engineering cost-estimation assistant by SKYPIEA', titleA: 'Before construction starts,', titleB: 'let Beno estimate with you.',
      desc: 'Describe your project in your own words. Beno helps shape a preliminary estimate, organize work items, separate materials from labor, and flag missing inputs instead of guessing.',
      ctaPrimary: 'Estimate with Beno', ctaSecondary: 'See how Beno works', note: 'Start with what you know — you do not need every detail ready.',
      visualCaption: 'Illustrative example — not actual prices', online: 'Ready when you are', sampleUser: 'I want to estimate a new building.', sampleBeno: 'Let’s start with available data and identify gaps before showing a misleading total.', estimatePreview: 'What your estimate review looks like', stage1: 'Excavation & backfill', stage2: 'Reinforced concrete', stage3: 'Masonry & plaster', stage4: 'Finishes', statusData: 'Based on your project data', previewCta: 'Start your estimate',
      strip1: 'Clear work packages', strip2: 'Materials separated from labor', strip3: 'Missing inputs are visible', strip4: 'Review and edit quantities',
      featureEyebrow: 'What makes Beno useful?', featureTitleA: 'More than a chat,', featureTitleB: 'a practical estimating assistant.', featureDesc: 'Beno helps turn your project description into a reviewable estimate — not just a number without context.',
      f1Title: 'Understand natural language', f1Text: 'Start with a question the way you would explain it to an engineer.',
      f2Title: 'Organize the bill of quantities', f2Text: 'Group small resources under their work package while keeping detail available for review.',
      f3Title: 'Separate materials and labor', f3Text: 'See supply costs and labor costs independently instead of mixing them together.',
      f4Title: 'Expose missing data', f4Text: 'If an essential price or quantity is missing, Beno says so instead of inventing a confident total.',
      featureCta: 'Try this with Beno',
      tryEyebrow: 'Start with your question', tryTitleA: 'Not sure where to begin?', tryTitleB: 'Choose a starting point.', tryDesc: 'Each choice opens the same Beno conversation with a useful starter prompt — no sign-up or separate workflow.',
      try1Tag: 'Finishing', try1Title: 'Estimate an apartment finish', try1Text: 'Start with area, finish level, and the details you know.',
      try2Tag: 'New building', try2Title: 'Estimate a building', try2Text: 'Set floor area, number of floors, and project scope.',
      try3Tag: 'Price lookup', try3Title: 'Ask about a material or item', try3Text: 'Check the item, unit, recorded source, and price date.',
      tryAction: 'Start with Beno',
      howEyebrow: 'Simple by design', howTitleA: 'You explain.', howTitleB: 'Beno organizes the estimate.',
      how1Title: 'Tell Beno what you know', how1Text: 'Project type, area, or a question about a work item — any useful starting point.',
      how2Title: 'Beno asks what matters', how2Text: 'When an important input is missing, Beno asks instead of making an unsupported assumption.',
      how3Title: 'Review the result', how3Text: 'See main work items, open material and quantity details, and edit what needs review.',
      transparencyEyebrow: 'Clear estimates, honest limits', transparencyTitleA: 'A useful number', transparencyTitleB: 'comes with its basis.',
      transparencyText: 'Beno provides a preliminary estimate based on available calculation logic and catalog data. It is not an approved execution BOQ; quantities and local prices still need project-specific engineering review.',
      trans1: 'Units are explicit', trans2: 'Source and date shown when available', trans3: 'Quantities can be reviewed', trans4: 'Gaps shown instead of guessed',
      transparencyCta: 'Start a preliminary estimate',
      faqEyebrow: 'FAQ', faqTitleA: 'Before you start with', faqTitleB: 'Beno',
      q1: 'Do I need every project detail ready?', a1: 'No. Start with what you have. Beno will ask for important inputs when needed and explain when the data is insufficient.',
      q2: 'Is the amount a final construction price?', a2: 'No. It is a preliminary estimate. Final approval requires checking drawings, quantities, specifications, and local prices with an engineer.',
      q3: 'Can I change quantities?', a3: 'Yes. You can review and edit quantities in the estimate details and recalculate before relying on the result.',
      q4: 'What if an item has no price?', a4: 'Beno flags the price gap instead of substituting an unrelated item or hiding it in an unsupported total.',
      finalEyebrow: 'Start with one question', finalTitleA: 'Have a project in mind?', finalTitleB: 'Let Beno start with you.', finalText: 'No account or long form. Open the conversation and describe what you need to estimate.', finalCta: 'Chat with Beno and estimate',
      footerText: 'Engineering cost-estimation assistant — preliminary estimates for review.', footerCall: 'Talk to an engineer', rights: 'All rights reserved.', disclaimer: 'Beno does not replace professional engineering review or approved drawings and specifications.'
    }
  };

  function render() {
    const t = copy[language];
    const isAr = language === 'ar';
    document.documentElement.lang = language;
    document.documentElement.dir = isAr ? 'rtl' : 'ltr';
    document.title = isAr ? 'Beno | مساعد التسعير الهندسي من SKYPIEA' : 'Beno | Engineering Cost Estimation by SKYPIEA';
    document.querySelector('meta[name="description"]')?.setAttribute('content', isAr
      ? 'احكي عن مشروعك مع Beno، مساعد التسعير الهندسي من SKYPIEA. تقدير مبدئي منظم يفصل الخامات عن المصنعية ويظهر نواقص الأسعار والكميات.'
      : 'Talk to Beno, SKYPIEA’s engineering cost-estimation assistant. Get an organized preliminary estimate with materials, labor, and missing inputs clearly separated.');

    document.getElementById('root').innerHTML = `
      <div class="site-shell ${isAr ? 'is-arabic' : 'is-english'}">
        <header class="site-header" id="site-header">
          <div class="container header-inner">
            <a class="brand-link" href="#home" aria-label="SKYPIEA home">
              <span class="brand-symbol">S</span>
              <span class="brand-main"><strong>SKYPIEA</strong><small>ENGINEERING INTELLIGENCE</small></span>
              <span class="brand-divider"></span>
              <span class="brand-product"><strong>Beno</strong><small>${isAr ? 'مساعد التسعير' : 'COST ESTIMATOR'}</small></span>
            </a>
            <nav class="main-nav" aria-label="${isAr ? 'التنقل الرئيسي' : 'Main navigation'}">
              <a href="#features">${t.navFeatures}</a><a href="#example">${t.navExample}</a><a href="#faq">${t.navFaq}</a>
            </nav>
            <div class="header-actions"><button class="language-toggle" data-language>${t.language}</button><button class="button button--small button--primary" data-beno-open="header">${t.navCta}${icon('arrow', 16)}</button><button class="mobile-menu-button" data-menu aria-label="Menu">${icon('menu', 22)}</button></div>
          </div>
          <nav class="mobile-nav" id="mobile-nav"><a href="#features">${t.navFeatures}</a><a href="#example">${t.navExample}</a><a href="#faq">${t.navFaq}</a><button data-beno-open="mobile-nav">${t.navCta}${icon('arrow', 16)}</button></nav>
        </header>

        <main>
          <section id="home" class="hero-section section-anchor">
            <div class="hero-orb hero-orb--one"></div><div class="hero-orb hero-orb--two"></div>
            <div class="container hero-grid">
              <div class="hero-copy">
                <div class="hero-kicker"><span class="pulse-dot"></span>${t.eyebrow}</div>
                <h1>${t.titleA}<br><span>${t.titleB}</span></h1>
                <p class="hero-description">${t.desc}</p>
                <div class="hero-actions"><button class="button button--primary button--large" data-beno-open="hero">${t.ctaPrimary}${icon('arrow', 19)}</button><a class="button button--ghost button--large" href="#how-it-works">${t.ctaSecondary}${icon('arrow', 17)}</a></div>
                <div class="hero-note">${icon('check', 15)}<span>${t.note}</span></div>
                <div class="hero-metrics"><div><strong>${icon('layers', 18)}</strong><span>${t.strip1}</span></div><div><strong>${icon('ruler', 18)}</strong><span>${t.strip2}</span></div><div><strong>${icon('shield', 18)}</strong><span>${t.strip3}</span></div></div>
              </div>
              <div class="hero-visual" aria-label="${t.visualCaption}">
                <div class="visual-glow"></div>
                <div class="estimate-window">
                  <div class="estimate-window-top"><div class="window-dots"><i></i><i></i><i></i></div><span>${t.visualCaption}</span><span class="sample-badge">DEMO</span></div>
                  <div class="chat-preview-head"><span class="beno-avatar">B</span><span class="chat-preview-name"><strong>Beno</strong><small><i></i>${t.online}</small></span><span class="chat-head-icon">${icon('chat', 18)}</span></div>
                  <div class="chat-preview-body"><div class="sample-message sample-message--user">${t.sampleUser}</div><div class="sample-message sample-message--beno"><span class="mini-b-avatar">B</span><span>${t.sampleBeno}</span></div></div>
                  <div class="estimate-preview">
                    <div class="estimate-preview-title"><span>${icon('calculator', 17)}${t.estimatePreview}</span><span class="preview-label">${isAr ? 'مثال' : 'SAMPLE'}</span></div>
                    ${[['stage1','01'],['stage2','02'],['stage3','03'],['stage4','04']].map(([key,num]) => `<div class="preview-row"><span class="preview-number">${num}</span><strong>${t[key]}</strong><small>${t.statusData}</small><span class="preview-check">${icon('arrow', 14)}</span></div>`).join('')}
                    <button class="preview-cta" data-beno-open="preview">${t.previewCta}${icon('arrow', 16)}</button>
                  </div>
                </div>
                <div class="floating-note floating-note--top"><span class="floating-note-icon">${icon('check', 17)}</span><span><strong>${isAr ? 'منظّم' : 'Organized'}</strong><small>${isAr ? 'بند رئيسي لكل شغلانة' : 'One work package at a time'}</small></span></div>
                <div class="floating-note floating-note--bottom"><span class="floating-note-icon floating-note-icon--gold">${icon('shield', 17)}</span><span><strong>${isAr ? 'واضح' : 'Transparent'}</strong><small>${isAr ? 'النواقص مش مخفية' : 'Gaps are not hidden'}</small></span></div>
              </div>
            </div>
          </section>

          <section class="promise-strip"><div class="container promise-grid"><div>${icon('check', 17)}<span>${t.strip1}</span></div><div>${icon('check', 17)}<span>${t.strip2}</span></div><div>${icon('check', 17)}<span>${t.strip3}</span></div><div>${icon('check', 17)}<span>${t.strip4}</span></div></div></section>

          <section id="features" class="features-section section-padding section-anchor"><div class="container"><div class="section-heading"><span class="eyebrow">${t.featureEyebrow}</span><h2>${t.featureTitleA}<span>${t.featureTitleB}</span></h2><p>${t.featureDesc}</p></div>
            <div class="feature-grid">
              ${[{n:'01',i:'chat',title:t.f1Title,text:t.f1Text},{n:'02',i:'layers',title:t.f2Title,text:t.f2Text},{n:'03',i:'calculator',title:t.f3Title,text:t.f3Text},{n:'04',i:'shield',title:t.f4Title,text:t.f4Text}].map(item => `<article class="feature-card"><div class="feature-card-top"><span class="feature-icon">${icon(item.i,25)}</span><span class="feature-number">${item.n}</span></div><h3>${item.title}</h3><p>${item.text}</p><button class="inline-cta" data-beno-open="feature-${item.n}">${t.featureCta}${icon('arrow',15)}</button></article>`).join('')}
            </div>
          </div></section>

          <section id="example" class="try-section section-padding section-anchor"><div class="container"><div class="section-heading section-heading--center"><span class="eyebrow">${t.tryEyebrow}</span><h2>${t.tryTitleA}<span>${t.tryTitleB}</span></h2><p>${t.tryDesc}</p></div>
            <div class="starter-grid">
              <button class="starter-card starter-card--blue" data-beno-open="prompt-apartment" data-prompt="${isAr ? 'عايز أحسب تكلفة تشطيب شقة' : 'I want to estimate apartment finishing cost'}"><span class="starter-tag">${t.try1Tag}</span><span class="starter-icon">${icon('cube',27)}</span><strong>${t.try1Title}</strong><p>${t.try1Text}</p><span class="starter-action">${t.tryAction}${icon('arrow',16)}</span></button>
              <button class="starter-card starter-card--dark" data-beno-open="prompt-building" data-prompt="${isAr ? 'عايز أقدّر تكلفة عمارة جديدة' : 'I want to estimate a new building'}"><span class="starter-tag">${t.try2Tag}</span><span class="starter-icon">${icon('layers',27)}</span><strong>${t.try2Title}</strong><p>${t.try2Text}</p><span class="starter-action">${t.tryAction}${icon('arrow',16)}</span></button>
              <button class="starter-card starter-card--light" data-beno-open="prompt-price" data-prompt="${isAr ? 'عايز أعرف سعر خامة أو بند في البناء' : 'I want to look up a construction material or item price'}"><span class="starter-tag">${t.try3Tag}</span><span class="starter-icon">${icon('calculator',27)}</span><strong>${t.try3Title}</strong><p>${t.try3Text}</p><span class="starter-action">${t.tryAction}${icon('arrow',16)}</span></button>
            </div>
          </div></section>

          <section id="how-it-works" class="how-section section-padding section-anchor"><div class="container"><div class="how-intro"><div><span class="eyebrow">${t.howEyebrow}</span><h2>${t.howTitleA}<br><span>${t.howTitleB}</span></h2></div><button class="button button--primary" data-beno-open="how">${t.ctaPrimary}${icon('arrow',17)}</button></div>
            <div class="how-grid">${[{n:'01',i:'message',title:t.how1Title,text:t.how1Text},{n:'02',i:'spark',title:t.how2Title,text:t.how2Text},{n:'03',i:'ruler',title:t.how3Title,text:t.how3Text}].map(item => `<article class="how-card"><span class="how-number">${item.n}</span><span class="how-icon">${icon(item.i,24)}</span><h3>${item.title}</h3><p>${item.text}</p></article>`).join('')}</div>
          </div></section>

          <section class="transparency-section section-padding"><div class="container transparency-panel"><div class="transparency-copy"><span class="eyebrow eyebrow--light">${t.transparencyEyebrow}</span><h2>${t.transparencyTitleA}<span>${t.transparencyTitleB}</span></h2><p>${t.transparencyText}</p><button class="button button--primary button--large" data-beno-open="transparency">${t.transparencyCta}${icon('arrow',17)}</button></div><div class="transparency-list">${[t.trans1,t.trans2,t.trans3,t.trans4].map((line,i)=>`<div class="transparency-item"><span>${icon('check',17)}</span><p>${line}</p><small>0${i+1}</small></div>`).join('')}<div class="transparency-footnote">${icon('shield',16)}<span>${t.disclaimer}</span></div></div></div></section>

          <section id="faq" class="faq-section section-padding section-anchor"><div class="container faq-grid"><div class="section-heading"><span class="eyebrow">${t.faqEyebrow}</span><h2>${t.faqTitleA} <span>${t.faqTitleB}؟</span></h2><p>${t.disclaimer}</p><button class="button button--secondary" data-beno-open="faq">${t.ctaPrimary}${icon('arrow',17)}</button></div><div class="faq-list">${[[t.q1,t.a1],[t.q2,t.a2],[t.q3,t.a3],[t.q4,t.a4]].map(([q,a],i)=>`<details class="faq-item" ${i===0?'open':''}><summary><span>${q}</span><i>${icon('plus',17)}</i></summary><p>${a}</p></details>`).join('')}</div></div></section>

          <section class="final-section"><div class="final-decoration final-decoration--one"></div><div class="final-decoration final-decoration--two"></div><div class="container final-inner"><span class="eyebrow eyebrow--light">${t.finalEyebrow}</span><h2>${t.finalTitleA}<br><span>${t.finalTitleB}</span></h2><p>${t.finalText}</p><button class="button button--primary button--large" data-beno-open="final">${t.finalCta}${icon('arrow',18)}</button><div class="final-small-note">${icon('check',14)}${t.note}</div></div></section>
        </main>

        <footer class="site-footer"><div class="container footer-main"><div class="footer-brand"><a class="footer-lockup" href="#home"><span class="brand-symbol">S</span><span><strong>SKYPIEA</strong><small>Beno · ENGINEERING COST ESTIMATION</small></span></a><p>${t.footerText}</p><div class="footer-disclaimer">${t.disclaimer}</div></div><div class="footer-links"><strong>${isAr ? 'استكشف' : 'Explore'}</strong><a href="#features">${t.navFeatures}</a><a href="#example">${t.navExample}</a><a href="#faq">${t.navFaq}</a></div><div class="footer-contact"><strong>${isAr ? 'عايز تبدأ؟' : 'Ready to start?'}</strong><button data-beno-open="footer">${t.tryAction}${icon('arrow',15)}</button><a href="https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(isAr ? 'مرحبًا، أريد مراجعة تقدير مبدئي مع مهندس.' : 'Hello, I would like an engineer to review my preliminary estimate.') }" target="_blank" rel="noreferrer">${icon('message',16)} ${t.footerCall}</a><a href="tel:+${WHATSAPP_NUMBER}" dir="ltr">${icon('phone',15)} ${PHONE_DISPLAY}</a></div></div><div class="container footer-bottom"><span>© ${new Date().getFullYear()} SKYPIEA</span><span>${t.rights}</span><span class="footer-bottom-note">${t.disclaimer}</span></div></footer>
      </div>`;

    attachEvents();
  }

  function openBeno(source, prompt = '') {
    if (window.BenoChat && typeof window.BenoChat.open === 'function') {
      window.BenoChat.open(prompt ? `prompt:${prompt}` : source || 'landing-cta');
      return;
    }
    const launcher = document.querySelector('button.beno-launcher');
    if (launcher) launcher.click();
    else window.setTimeout(() => openBeno(source, prompt), 250);
  }

  function attachEvents() {
    document.querySelectorAll('[data-beno-open]').forEach((button) => button.addEventListener('click', () => {
      openBeno(button.dataset.benoOpen, button.dataset.prompt || '');
    }));

    document.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', () => {
      language = language === 'ar' ? 'en' : 'ar';
      render();
    }));

    document.querySelectorAll('[data-menu]').forEach((button) => button.addEventListener('click', () => {
      document.getElementById('mobile-nav')?.classList.toggle('mobile-nav--open');
    }));

    document.querySelectorAll('.mobile-nav a').forEach((link) => link.addEventListener('click', () => {
      document.getElementById('mobile-nav')?.classList.remove('mobile-nav--open');
    }));

    document.querySelectorAll('.faq-item').forEach((item) => item.addEventListener('toggle', () => {
      const iconNode = item.querySelector('summary i');
      if (iconNode) iconNode.innerHTML = icon(item.open ? 'close' : 'plus', 17);
    }));
  }

  render();
})();
