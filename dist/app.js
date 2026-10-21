(() => {
  'use strict';

  const PHONE_DISPLAY = '01550130114';
  const WHATSAPP_NUMBER = '201550130114';
  let language = 'ar';
  let activeSector = 'engineering';
  let mobileMenuOpen = false;
  let brandGradientCount = 0;
  const draft = { name: '', phone: '', sector: '', message: '' };

  const copy = {
    ar: {
      nav: { home: 'الرئيسية', sectors: 'قطاعاتنا', services: 'خدماتنا', beno: 'Beno الذكي', approach: 'منهجيتنا', about: 'عنّا', contact: 'تواصل معنا' },
      announcement: 'مظلة واحدة · تخصصات متكاملة · حلول عملية',
      heroEyebrow: 'حلول هندسية وتكنولوجية متكاملة', heroTitleA: 'نبني الواقع،', heroTitleB: 'ونوسّع الإمكانيات.',
      heroDesc: 'من الرسومات الهندسية إلى الأنظمة الرقمية الذكية، تجمع SKYPIEA الخبرة الهندسية والتكنولوجيا في مكان واحد لتساعدك على تحويل احتياجك إلى حل واضح وقابل للتنفيذ.',
      ctaPrimary: 'ناقش مشروعك معنا', ctaSecondary: 'اكتشف خدماتنا', heroFoot: 'حلول مصممة لاحتياجك، وليست مجرد خدمات جاهزة.',
      visualTag: 'حلول تحت مظلة واحدة', visualHeadline: 'الفكرة تبدأ هنا.', visualSub: 'والتنفيذ يصنع الفرق.', floatingEngineering: 'الهندسة', floatingTech: 'التكنولوجيا',
      valueOneTitle: 'رؤية متكاملة', valueOneText: 'نفهم الصورة الكبيرة قبل تفاصيل التنفيذ.', valueTwoTitle: 'حلول عملية', valueTwoText: 'خطوات واضحة مبنية على احتياجك الحقيقي.', valueThreeTitle: 'تواصل مباشر', valueThreeText: 'نتابع معك من أول مناقشة حتى التسليم.',
      sectorsEyebrow: 'قطاعاتنا', sectorsTitle: 'تخصصان مختلفان،', sectorsTitleB: 'رؤية واحدة.', sectorsDesc: 'نجمع بين عالم البناء وعالم التقنية داخل كيان واحد، لتجد الشريك المناسب للمشروع الذي تريد إنجازه.',
      engineering: 'الهندسة', technology: 'التكنولوجيا', explore: 'استكشف القطاع', engineeringShort: 'من التصميم إلى التنفيذ', technologyShort: 'من الفكرة إلى الحل الرقمي',
      engineeringDesc: 'حلول هندسية عملية تراعي متطلبات المشروع، وتدعم اتخاذ القرار والتنفيذ بجودة ووضوح.', technologyDesc: 'حلول رقمية تساعد الشركات على تحسين تجربة العملاء، وتنظيم العمل، وأتمتة المهام المتكررة.',
      engineeringServices: [
        { title: 'الرسومات الهندسية', desc: 'إعداد وتطوير الرسومات والمخططات وفق متطلبات المشروع.' },
        { title: 'الإشراف الهندسي', desc: 'متابعة الأعمال لضمان الالتزام بالمخططات والمتطلبات المتفق عليها.' },
        { title: 'تنفيذ المشروعات', desc: 'تنفيذ أعمال البناء من خلال نطاق عمل واضح وخطة منظمة.' }
      ],
      technologyServices: [
        { title: 'المواقع وتطبيقات الويب', desc: 'تجارب رقمية احترافية تساعد نشاطك على الظهور والنمو.' },
        { title: 'التطبيقات والأنظمة', desc: 'تطبيقات وأنظمة لإدارة العمليات والبيانات واحتياجات العمل.' },
        { title: 'الذكاء الاصطناعي والأتمتة', desc: 'حلول عملية لتقليل العمل اليدوي وربط خطوات العمل ببعضها.' },
        { title: 'Beno — مساعد التسعير الهندسي', desc: 'مساعد متخصص يساعد المهندس على تنظيم التقدير ومراجعة الكميات والأسعار الناقصة.', beno: true }
      ],
      serviceEyebrow: 'ماذا نقدم؟', serviceTitle: 'حلول واضحة،', serviceTitleB: 'تبدأ من احتياجك.', serviceDesc: 'اختر القطاع المناسب لمشروعك، وسنبدأ بفهم المطلوب وتحديد نطاق عمل واضح قبل اقتراح الحل.',
      engineeringTab: 'الخدمات الهندسية', technologyTab: 'الخدمات التكنولوجية', serviceCta: 'اطلب مناقشة الخدمة',
      benoEyebrow: 'منتج ذكي ضمن حلولنا التكنولوجية', benoTitle: 'Beno', benoTitleB: 'مساعد التسعير الهندسي من SKYPIEA.', benoDesc: 'طوّرنا Beno ليكون إحدى حلولنا التكنولوجية المتخصصة في تقدير تكاليف البناء. يساعد المهندس على تنظيم البنود، وفصل الخامات عن المصنعية، وإظهار البيانات الناقصة بوضوح — بجانب خدماتنا الهندسية والتكنولوجية الأخرى.', benoBadge: 'إحدى حلول SKYPIEA', benoPointOne: 'تنظيم بنود المقايسة حسب مراحل العمل', benoPointTwo: 'فصل التوريدات والخامات عن المصنعية', benoPointThree: 'إظهار فجوات الكميات والأسعار بدل التخمين', benoTry: 'جرّب Beno', benoOtherServices: 'استكشف باقي الخدمات', benoPreviewLabel: 'داخل تجربة Beno', benoPreviewUser: 'عايز أراجع تقدير تشطيب شقة.', benoPreviewReply: 'نبدأ بالبيانات المتاحة، ونراجع الوحدات والكميات والأسعار الناقصة قبل عرض أي إجمالي.', benoRowOne: 'تنظيم البنود', benoRowTwo: 'الخامات والمصنعية', benoRowThree: 'النواقص والافتراضات', benoPreviewCaption: 'معاينة توضيحية للتجربة — ليست نتيجة مشروع حقيقي.',
      differenceEyebrow: 'لماذا SKYPIEA؟', differenceTitle: 'مش شغل منفصل؛', differenceTitleB: 'حل متكامل.', differenceDesc: 'نؤمن أن جودة الحل لا تعتمد على تنفيذه فقط، بل على فهم المشكلة، وضوح الخطوات، والتواصل الجيد طوال الطريق.',
      benefitOneTitle: 'فهم قبل التنفيذ', benefitOneText: 'نبدأ بتحديد الهدف والأولويات والنتيجة المطلوبة.', benefitTwoTitle: 'توقعات واضحة', benefitTwoText: 'نوضح نطاق العمل والمخرجات والخطوات من البداية.', benefitThreeTitle: 'تفكير يجمع التخصصات', benefitThreeText: 'نربط الخبرة الهندسية بالحلول الرقمية حين تخدم المشروع.', benefitFourTitle: 'شراكة قابلة للنمو', benefitFourText: 'حلول قابلة للتطوير مع تغيّر احتياجاتك.',
      approachEyebrow: 'منهجية العمل', approachTitle: 'خطوات بسيطة،', approachTitleB: 'منظمة وواضحة.', stepOne: 'نفهم احتياجك', stepOneText: 'نستمع لفكرة المشروع والأهداف والتحديات.', stepTwo: 'نحدد الحل', stepTwoText: 'نرتب نطاق العمل والمخرجات والخطوات المقترحة.', stepThree: 'نبدأ التنفيذ', stepThreeText: 'نعمل على الحل المتفق عليه بمتابعة وتواصل واضح.', stepFour: 'نسلّم ونطوّر', stepFourText: 'نراجع المخرجات ونحدد الخطوات التالية عند الحاجة.',
      aboutEyebrow: 'عن SKYPIEA', aboutTitle: 'مظلة واحدة،', aboutTitleB: 'لبناء ما هو أفضل.', aboutText: 'SKYPIEA كيان يجمع الحلول الهندسية والتكنولوجية تحت رؤية واحدة. هدفنا تقديم خدمات مفهومة وعملية تساعد الأفراد والشركات على إنجاز مشروعاتهم وتنظيم أعمالهم بثقة أكبر.', aboutPointOne: 'تركيز على الهدف والنتيجة', aboutPointTwo: 'تواصل واضح من البداية', aboutPointThree: 'اختيار الحل المناسب، لا الأكثر تعقيدًا',
      contactEyebrow: 'ابدأ من هنا', contactTitle: 'عندك مشروع في ذهنك؟', contactTitleB: 'خلّينا نتكلم.', contactDesc: 'احكِ لنا باختصار عن احتياجك، وسنحوّل التفاصيل إلى رسالة واضحة لبدء النقاش عبر واتساب.',
      formName: 'الاسم', formNamePlaceholder: 'اكتب اسمك', formPhone: 'رقم التواصل (اختياري)', formPhonePlaceholder: 'رقم الهاتف', formSector: 'الخدمة المطلوبة', selectService: 'اختر القطاع', formMessage: 'نبذة عن المشروع', formMessagePlaceholder: 'ما الذي تريد تنفيذه أو تطويره؟', sendWhatsApp: 'إرسال الطلب عبر واتساب', formHint: 'لن يتم حفظ البيانات على الموقع؛ ستُفتح رسالة واتساب بالمعلومات التي أدخلتها.',
      callUs: 'اتصل بنا', whatsappUs: 'راسلنا على واتساب', contactLabel: 'تواصل مباشر', finalLine: 'هندسة تبني الهياكل. وتكنولوجيا تفتح الإمكانيات.', footerDesc: 'حلول هندسية وتكنولوجية متكاملة تحت مظلة واحدة.', quickLinks: 'روابط سريعة', sectorsFooter: 'القطاعات', rights: 'جميع الحقوق محفوظة.', whatsappMessage: 'مرحبًا SKYPIEA، أرغب في مناقشة مشروع أو خدمة.'
    },
    en: {
      nav: { home: 'Home', sectors: 'Our sectors', services: 'Services', beno: 'Beno AI', approach: 'Our approach', about: 'About', contact: 'Contact' },
      announcement: 'One umbrella · Integrated disciplines · Practical solutions',
      heroEyebrow: 'Integrated engineering & technology solutions', heroTitleA: 'We build what matters,', heroTitleB: 'and unlock what’s next.',
      heroDesc: 'From engineering drawings to intelligent digital systems, SKYPIEA brings engineering expertise and technology together to turn your needs into clear, actionable solutions.',
      ctaPrimary: 'Discuss your project', ctaSecondary: 'Explore services', heroFoot: 'Solutions shaped around your needs—not off-the-shelf services.',
      visualTag: 'Integrated under one umbrella', visualHeadline: 'Every idea starts somewhere.', visualSub: 'Execution makes the difference.', floatingEngineering: 'Engineering', floatingTech: 'Technology',
      valueOneTitle: 'A joined-up view', valueOneText: 'We see the bigger picture before the details.', valueTwoTitle: 'Practical solutions', valueTwoText: 'Clear steps built around your real needs.', valueThreeTitle: 'Direct communication', valueThreeText: 'From the first conversation to delivery.',
      sectorsEyebrow: 'Our sectors', sectorsTitle: 'Two disciplines,', sectorsTitleB: 'one vision.', sectorsDesc: 'We connect the world of construction with the world of technology in one company, giving you the right partner for the work ahead.',
      engineering: 'Engineering', technology: 'Technology', explore: 'Explore sector', engineeringShort: 'From design to delivery', technologyShort: 'From idea to digital solution',
      engineeringDesc: 'Practical engineering services shaped around project requirements, supporting clear decisions and quality execution.', technologyDesc: 'Digital solutions that help businesses improve customer experiences, organize operations, and automate repetitive work.',
      engineeringServices: [
        { title: 'Engineering drawings', desc: 'Preparation and development of drawings and plans around project requirements.' },
        { title: 'Engineering supervision', desc: 'Follow-up of work against agreed drawings, requirements, and standards.' },
        { title: 'Project execution', desc: 'Construction delivery supported by a clear scope and organized plan.' }
      ],
      technologyServices: [
        { title: 'Websites & web apps', desc: 'Professional digital experiences that help your business show up and grow.' },
        { title: 'Apps & business systems', desc: 'Applications and systems for operations, data, and day-to-day business needs.' },
        { title: 'AI & automation', desc: 'Practical solutions to reduce manual work and connect business processes.' },
        { title: 'Beno — engineering cost assistant', desc: 'A specialized assistant to organize preliminary estimates and review missing quantities and prices.', beno: true }
      ],
      serviceEyebrow: 'What we do', serviceTitle: 'Clear solutions,', serviceTitleB: 'starting with your needs.', serviceDesc: 'Choose the sector that fits your project. We begin by understanding the goal and defining a clear scope before recommending a solution.',
      engineeringTab: 'Engineering services', technologyTab: 'Technology services', serviceCta: 'Discuss this service',
      benoEyebrow: 'A focused product within our technology solutions', benoTitle: 'Beno', benoTitleB: 'SKYPIEA’s engineering cost assistant.', benoDesc: 'Beno is one of our specialized technology solutions for construction cost estimation. It helps engineers organize work items, separate materials from labor, and identify missing inputs clearly — alongside our wider engineering and technology services.', benoBadge: 'A SKYPIEA solution', benoPointOne: 'Organizes BOQ items by work stage', benoPointTwo: 'Separates material supply from labor', benoPointThree: 'Flags missing quantities and prices instead of guessing', benoTry: 'Try Beno', benoOtherServices: 'Explore our other services', benoPreviewLabel: 'Inside Beno', benoPreviewUser: 'I need to review an apartment finishing estimate.', benoPreviewReply: 'We’ll start with available details and review units, quantities, and missing prices before presenting a total.', benoRowOne: 'Work-item organization', benoRowTwo: 'Materials and labor', benoRowThree: 'Gaps and assumptions', benoPreviewCaption: 'Illustrative preview — not a real project result.',
      differenceEyebrow: 'Why SKYPIEA', differenceTitle: 'Not isolated tasks;', differenceTitleB: 'a connected solution.', differenceDesc: 'Good solutions depend on more than delivery. They start with understanding the challenge, defining the steps, and communicating clearly throughout.',
      benefitOneTitle: 'Understand first', benefitOneText: 'We identify the goal, priorities, and desired outcome.', benefitTwoTitle: 'Clear expectations', benefitTwoText: 'Scope, deliverables, and steps are discussed upfront.', benefitThreeTitle: 'Cross-disciplinary thinking', benefitThreeText: 'We connect engineering expertise with digital solutions where useful.', benefitFourTitle: 'Room to grow', benefitFourText: 'Solutions can evolve as your needs change.',
      approachEyebrow: 'How we work', approachTitle: 'Simple steps,', approachTitleB: 'clear throughout.', stepOne: 'Understand', stepOneText: 'We listen to your idea, goals, and challenges.', stepTwo: 'Define', stepTwoText: 'We outline the scope, deliverables, and possible next steps.', stepThree: 'Build', stepThreeText: 'We work on the agreed solution with clear follow-up.', stepFour: 'Deliver & improve', stepFourText: 'We review the outcome and identify next steps if needed.',
      aboutEyebrow: 'About SKYPIEA', aboutTitle: 'One umbrella,', aboutTitleB: 'built for what’s next.', aboutText: 'SKYPIEA brings engineering and technology solutions together under one vision. We aim to provide practical, understandable services that help individuals and businesses deliver projects and run their work with greater confidence.', aboutPointOne: 'Focus on outcomes', aboutPointTwo: 'Clear communication from day one', aboutPointThree: 'The right solution, not the most complex one',
      contactEyebrow: 'Start here', contactTitle: 'Have a project in mind?', contactTitleB: 'Let’s talk.', contactDesc: 'Tell us briefly what you need. We’ll turn your details into a clear WhatsApp message to start the conversation.',
      formName: 'Name', formNamePlaceholder: 'Your name', formPhone: 'Contact number (optional)', formPhonePlaceholder: 'Phone number', formSector: 'Service needed', selectService: 'Choose a sector', formMessage: 'Project overview', formMessagePlaceholder: 'What would you like to build or improve?', sendWhatsApp: 'Send request via WhatsApp', formHint: 'Your details are not saved on this website. WhatsApp opens with your message ready to send.',
      callUs: 'Call us', whatsappUs: 'Message us on WhatsApp', contactLabel: 'Direct contact', finalLine: 'Engineering builds structures. Technology builds possibilities.', footerDesc: 'Integrated engineering and technology solutions under one umbrella.', quickLinks: 'Quick links', sectorsFooter: 'Sectors', rights: 'All rights reserved.', whatsappMessage: 'Hello SKYPIEA, I would like to discuss a project or service.'
    }
  };

  const iconPaths = {
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
    arrowLeft: '<path d="M19 12H5m7-7-7 7 7 7"/>',
    arrowDown: '<path d="M12 4v16m-7-7 7 7 7-7"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="m18 6-12 12M6 6l12 12"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
    zap: '<path d="m13 2-3 8h7l-6 12 2-9H6l7-11Z"/>',
    message: '<path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 21l2-5.4A8.5 8.5 0 1 1 21 11.5Z"/>',
    draft: '<path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/><path d="M3 3h7M3 3v7"/>',
    shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
    building: '<path d="M4 21V5l8-3v19M12 8h8v13M2 21h20M7 8h2m-2 4h2m-2 4h2m7-4h2m-2 4h2"/>',
    cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9zM9 1v4m6-4v4M9 19v4m6-4v4M1 9h4m-4 6h4m14-6h4m-4 6h4"/>',
    globe2: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
    device: '<rect x="3" y="4" width="13" height="15" rx="2"/><path d="M7 8h5M7 12h5M8 19v2h13V8h-5"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 3v5M8 13h.01M16 13h.01M9 17h6M2 13v3m20-3v3"/>',
    workflow: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><path d="M9 6h6M18 9v6M6 9v9h9"/>',
    monitor: '<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M8 21h8m-4-5v5"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 11.2 19a19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 8.9a16 16 0 0 0 6 6l1.2-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.8 2.1Z"/>',
    spark: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    shieldcheck: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
  };
  function icon(name, size = 20, extra = '') {
    const body = iconPaths[name] || iconPaths.spark;
    return `<svg class="${extra}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }
  function brandMark(light = false, compact = false) {
    const gradientId = `mark-gradient-${++brandGradientCount}`;
    return `<span class="brand-lockup ${compact ? 'brand-lockup--compact' : ''}">
      <svg class="brand-symbol" viewBox="0 0 150 110" aria-hidden="true">
        <defs><linearGradient id="${gradientId}" x1="8" y1="8" x2="137" y2="100" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${light ? '#7abaff' : '#0b4fbd'}"/><stop offset=".58" stop-color="${light ? '#ffffff' : '#2563eb'}"/><stop offset="1" stop-color="${light ? '#cce5ff' : '#60a5fa'}"/></linearGradient></defs>
        <path d="M20 28C24 22 31 18 42 14L105 1C115 -1 124 3 132 10L145 22L101 28L53 45C41 49 29 49 22 44C16 40 16 33 20 28Z" fill="url(#${gradientId})"/>
        <path d="M22 48L63 33C74 29 85 32 94 39L126 62C138 71 135 78 122 84L64 108C53 112 43 109 33 102L5 83C23 88 38 86 54 79L86 65C92 62 92 58 85 55L57 43L36 51Z" fill="url(#${gradientId})"/>
      </svg><span class="brand-word-area"><span class="brand-word ${light ? 'brand-word--light' : ''}">SKYPIEA</span>${compact ? '' : `<span class="brand-tagline ${light ? 'brand-tagline--light' : ''}">ENGINEERING &amp; TECHNOLOGY SOLUTIONS</span>`}</span>
    </span>`;
  }
  function heading(eyebrow, title, titleB = '', desc = '', align = 'right') {
    return `<div class="section-heading section-heading--${align}"><span class="eyebrow"><span></span>${eyebrow}</span><h2>${title} ${titleB ? `<span>${titleB}</span>` : ''}</h2>${desc ? `<p>${desc}</p>` : ''}</div>`;
  }
  function whatsappLink(message = copy[language].whatsappMessage) {
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  }
  const nav = (t) => [
    { id: 'home', label: t.nav.home }, { id: 'sectors', label: t.nav.sectors }, { id: 'services', label: t.nav.services },
    { id: 'beno', label: t.nav.beno }, { id: 'approach', label: t.nav.approach }, { id: 'about', label: t.nav.about }
  ];

  function renderServiceCards(t) {
    const items = activeSector === 'engineering' ? t.engineeringServices : t.technologyServices;
    const icons = activeSector === 'engineering' ? ['draft', 'shield', 'building'] : ['globe2', 'device', 'bot', 'spark'];
    return items.map((service, index) => {
      const action = service.beno
        ? `<button class="service-link" data-beno-open="service-card" data-beno-prompt="${language === 'ar' ? 'عايز أجرّب Beno في تقدير تكلفة مشروع بناء' : 'I want to try Beno for a construction cost estimate'}">${t.benoTry}${icon('arrowLeft', 16)}</button>`
        : `<button class="service-link" data-discuss-sector="${activeSector}">${t.serviceCta}${icon('arrowLeft', 16)}</button>`;
      return `<article class="service-card ${service.beno ? 'service-card--beno' : ''}"><div class="service-card-heading"><span class="service-icon">${icon(icons[index] || 'spark', 24)}</span><span class="service-number">0${index + 1}</span></div><h3>${service.title}</h3><p>${service.desc}</p>${action}</article>`;
    }).join('');
  }

  function render() {
    const t = copy[language];
    const isAr = language === 'ar';
    document.documentElement.lang = language;
    document.documentElement.dir = isAr ? 'rtl' : 'ltr';
    document.title = isAr ? 'SKYPIEA | حلول هندسية وتكنولوجية متكاملة' : 'SKYPIEA | Engineering & Technology Solutions';
    const navLinks = nav(t);
    document.getElementById('root').innerHTML = `
    <div class="site-shell ${isAr ? 'is-arabic' : 'is-english'}">
      <header class="site-header" id="site-header"><div class="container header-inner">
        <a class="brand-link" href="#home" data-scroll="home" aria-label="SKYPIEA home">${brandMark(false, true)}<span class="brand-small-label">ENGINEERING <i></i> TECHNOLOGY</span></a>
        <nav class="main-nav ${mobileMenuOpen ? 'main-nav--open' : ''}" aria-label="${isAr ? 'التنقل الرئيسي' : 'Main navigation'}">${navLinks.map(item => `<button data-scroll="${item.id}">${item.label}</button>`).join('')}<button class="nav-contact-mobile" data-scroll="contact">${t.nav.contact}</button></nav>
        <div class="header-actions"><button class="language-toggle" data-language aria-label="${isAr ? 'Switch to English' : 'التبديل إلى العربية'}">${icon('globe', 16)}<span>${isAr ? 'EN' : 'عربي'}</span></button><button class="button button--small button--nav" data-scroll="contact">${t.nav.contact}${icon('arrow', 16)}</button><button class="mobile-menu-button" data-menu aria-label="${mobileMenuOpen ? 'Close menu' : 'Open menu'}">${icon(mobileMenuOpen ? 'close' : 'menu', 22)}</button></div>
      </div></header>
      <main>
        <section id="home" class="hero-section section-anchor"><div class="hero-glow hero-glow--one"></div><div class="hero-glow hero-glow--two"></div><div class="container hero-grid">
          <div class="hero-copy"><div class="hero-kicker"><span class="kicker-dot"></span>${t.heroEyebrow}</div><h1>${t.heroTitleA}<br><span>${t.heroTitleB}</span></h1><p class="hero-description">${t.heroDesc}</p><div class="hero-actions"><button class="button button--primary" data-scroll="contact">${t.ctaPrimary}${icon('arrowLeft', 18)}</button><button class="button button--secondary" data-scroll="services">${t.ctaSecondary}${icon('arrowDown', 17)}</button></div><div class="hero-trust-line"><span class="hero-check">${icon('check', 14)}</span>${t.heroFoot}</div><div class="hero-micro-stats"><div><strong>02</strong><span>${t.sectorsEyebrow}</span></div><span class="micro-divider"></span><div><strong>01</strong><span>${isAr ? 'رؤية موحّدة' : 'Unified vision'}</span></div><span class="micro-divider"></span><div><strong>∞</strong><span>${isAr ? 'إمكانيات للنمو' : 'Room to grow'}</span></div></div></div>
          <div class="hero-art-wrap" aria-label="SKYPIEA engineering and technology visual"><div class="hero-art-frame"><img src="./assets/architecture.svg" class="architecture-illustration" alt="Abstract architectural facade representing engineering and technology"><div class="art-overlay"></div><div class="art-topline"><span class="art-status"><span></span>${t.visualTag}</span><span class="art-cross">✳</span></div><div class="art-message"><span class="art-label">SKYPIEA / 01</span><h2>${t.visualHeadline}<br><span>${t.visualSub}</span></h2><div class="art-line"></div></div><div class="art-bottom-meta">${brandMark(true, true)}<span>${isAr ? 'حلول متكاملة' : 'Integrated solutions'}</span></div></div><div class="floating-card floating-card--engineering"><span class="floating-icon">${icon('draft', 20)}</span><span><b>${t.floatingEngineering}</b><small>${isAr ? 'دقة · تخطيط · تنفيذ' : 'Precision · Planning · Delivery'}</small></span><span class="floating-arrow">${icon('arrow', 16)}</span></div><div class="floating-card floating-card--technology"><span class="floating-icon floating-icon--blue">${icon('cpu', 20)}</span><span><b>${t.floatingTech}</b><small>${isAr ? 'أنظمة · حلول · أتمتة' : 'Systems · Solutions · Automation'}</small></span><span class="floating-arrow">${icon('arrow', 16)}</span></div><div class="hero-art-orbit"></div></div>
        </div><div class="container hero-values"><div class="value-item"><span class="value-icon">${icon('layers', 20)}</span><div><h3>${t.valueOneTitle}</h3><p>${t.valueOneText}</p></div></div><div class="value-item"><span class="value-icon">${icon('zap', 20)}</span><div><h3>${t.valueTwoTitle}</h3><p>${t.valueTwoText}</p></div></div><div class="value-item"><span class="value-icon">${icon('message', 20)}</span><div><h3>${t.valueThreeTitle}</h3><p>${t.valueThreeText}</p></div></div></div></section>

        <section id="sectors" class="sectors-section section-padding section-anchor"><div class="container">${heading(t.sectorsEyebrow, t.sectorsTitle, t.sectorsTitleB, t.sectorsDesc)}<div class="sector-cards">
          <article class="sector-card sector-card--engineering"><div class="sector-card-top"><span class="sector-index">01 / ENGINEERING</span><span class="sector-icon-large">${icon('draft', 33)}</span></div><h3>${t.engineering}</h3><p class="sector-card-subtitle">${t.engineeringShort}</p><p class="sector-card-description">${t.engineeringDesc}</p><div class="sector-tags"><span>${isAr ? 'رسومات' : 'Drawings'}</span><span>${isAr ? 'إشراف' : 'Supervision'}</span><span>${isAr ? 'تنفيذ' : 'Execution'}</span></div><button class="text-link" data-pick-sector="engineering">${t.explore}<span>${icon('arrow', 18)}</span></button><div class="sector-card-graphic engineering-graphic"><div class="plan-lines"></div><div class="building-outline"><i></i><i></i><i></i><i></i><b></b></div><span class="graphic-dot graphic-dot--a"></span><span class="graphic-dot graphic-dot--b"></span></div></article>
          <article class="sector-card sector-card--technology"><div class="sector-card-top"><span class="sector-index">02 / TECHNOLOGY</span><span class="sector-icon-large">${icon('cpu', 34)}</span></div><h3>${t.technology}</h3><p class="sector-card-subtitle">${t.technologyShort}</p><p class="sector-card-description">${t.technologyDesc}</p><div class="sector-tags"><span>${isAr ? 'ويب وتطبيقات' : 'Web & apps'}</span><span>${isAr ? 'أنظمة أعمال' : 'Business systems'}</span><span>${isAr ? 'ذكاء اصطناعي' : 'AI'}</span></div><button class="text-link" data-pick-sector="technology">${t.explore}<span>${icon('arrow', 18)}</span></button><div class="sector-card-graphic technology-graphic"><div class="tech-orbit tech-orbit--one"></div><div class="tech-orbit tech-orbit--two"></div><div class="tech-center">${icon('workflow', 42)}</div><span class="tech-node tech-node--one">${icon('monitor', 18)}</span><span class="tech-node tech-node--two">${icon('bot', 18)}</span><span class="tech-node tech-node--three">${icon('cpu', 18)}</span></div></article>
        </div><div class="sectors-bottom-note"><span>${icon('spark', 17)}</span><p>${isAr ? 'قيمة SKYPIEA الحقيقية في ربط التخصص المناسب بالاحتياج الصحيح.' : 'SKYPIEA connects the right discipline to the need that matters.'}</p></div></div></section>

        <section id="services" class="services-section section-padding section-anchor"><div class="container"><div class="services-heading-row">${heading(t.serviceEyebrow, t.serviceTitle, t.serviceTitleB, t.serviceDesc)}<div class="service-tabs" role="tablist" aria-label="${isAr ? 'اختيار القطاع' : 'Choose a sector'}"><button role="tab" aria-selected="${activeSector === 'engineering'}" class="${activeSector === 'engineering' ? 'active' : ''}" data-sector-tab="engineering">${icon('draft', 17)}${t.engineeringTab}</button><button role="tab" aria-selected="${activeSector === 'technology'}" class="${activeSector === 'technology' ? 'active' : ''}" data-sector-tab="technology">${icon('cpu', 17)}${t.technologyTab}</button></div></div><div class="service-grid" id="service-grid">${renderServiceCards(t)}</div><div class="services-bottom"><span class="bottom-line"></span><span>${isAr ? 'هل احتياجك يجمع القطاعين؟' : 'Does your project need both sectors?'}</span><button data-scroll="contact">${isAr ? 'احكِ لنا عن فكرتك' : 'Tell us about your idea'}${icon('arrowLeft', 16)}</button></div></div></section>

        <section id="beno" class="beno-feature-section section-padding section-anchor"><div class="container beno-feature-grid">
          <div class="beno-feature-copy"><span class="beno-feature-kicker"><span></span>${t.benoEyebrow}</span><span class="beno-product-badge">${icon('spark', 15)} ${t.benoBadge}</span><h2>${t.benoTitle}<br><span>${t.benoTitleB}</span></h2><p>${t.benoDesc}</p><ul class="beno-feature-list"><li>${icon('check', 17)}${t.benoPointOne}</li><li>${icon('check', 17)}${t.benoPointTwo}</li><li>${icon('check', 17)}${t.benoPointThree}</li></ul><div class="beno-feature-actions"><button class="button button--primary" data-beno-open="company-feature" data-beno-prompt="${language === 'ar' ? 'عايز أعرف إزاي Beno يقدر يساعدني في تقدير مشروع البناء' : 'I want to see how Beno can help estimate my construction project'}">${t.benoTry}${icon('arrowLeft', 18)}</button><button class="button button--secondary" data-scroll="services">${t.benoOtherServices}${icon('arrowDown', 17)}</button></div><small class="beno-feature-footnote">${t.disclaimer || (isAr ? 'التقدير مبدئي ويحتاج مراجعة هندسية.' : 'Estimates are preliminary and require engineering review.')}</small></div>
          <div class="beno-feature-visual" aria-label="${t.benoPreviewCaption}"><div class="beno-demo-window"><div class="beno-demo-top"><span class="beno-demo-mark">B</span><span><strong>Beno</strong><small>${t.benoPreviewLabel}</small></span><i>${icon('spark', 16)}</i></div><div class="beno-demo-chat"><div class="beno-demo-message beno-demo-message--user">${t.benoPreviewUser}</div><div class="beno-demo-message beno-demo-message--assistant"><span class="beno-demo-avatar">B</span><p>${t.benoPreviewReply}</p></div></div><div class="beno-demo-checklist"><div><span>${icon('layers', 16)}</span><strong>${t.benoRowOne}</strong><i>${icon('check', 14)}</i></div><div><span>${icon('building', 16)}</span><strong>${t.benoRowTwo}</strong><i>${icon('check', 14)}</i></div><div><span>${icon('shieldcheck', 16)}</span><strong>${t.benoRowThree}</strong><i>${icon('check', 14)}</i></div></div><div class="beno-demo-caption">${icon('info', 14)}${t.benoPreviewCaption}</div></div><span class="beno-feature-orbit beno-feature-orbit--one"></span><span class="beno-feature-orbit beno-feature-orbit--two"></span></div>
        </div></section>

        <section class="difference-section section-padding"><div class="container difference-grid"><div class="difference-copy">${heading(t.differenceEyebrow, t.differenceTitle, t.differenceTitleB, t.differenceDesc)}<button class="button button--primary" data-scroll="contact">${t.ctaPrimary}${icon('arrowLeft', 18)}</button></div><div class="benefits-grid">
          ${[{ n: '01', i: 'shield', h: t.benefitOneTitle, p: t.benefitOneText }, { n: '02', i: 'check', h: t.benefitTwoTitle, p: t.benefitTwoText }, { n: '03', i: 'workflow', h: t.benefitThreeTitle, p: t.benefitThreeText }, { n: '04', i: 'layers', h: t.benefitFourTitle, p: t.benefitFourText }].map(b => `<div class="benefit-item"><span class="benefit-icon">${icon(b.i, 21)}</span><div><span class="benefit-index">${b.n}</span><h3>${b.h}</h3><p>${b.p}</p></div></div>`).join('')}
        </div></div></section>

        <section id="approach" class="approach-section section-padding section-anchor"><div class="container">${heading(t.approachEyebrow, t.approachTitle, t.approachTitleB, '', 'center')}<div class="process-grid">
          ${[{ n: '01', i: 'message', h: t.stepOne, p: t.stepOneText }, { n: '02', i: 'draft', h: t.stepTwo, p: t.stepTwoText }, { n: '03', i: 'zap', h: t.stepThree, p: t.stepThreeText }, { n: '04', i: 'check', h: t.stepFour, p: t.stepFourText }].map(s => `<article class="process-step"><div class="process-step-top"><span class="process-number">${s.n}</span><span class="process-icon">${icon(s.i, 23)}</span></div><h3>${s.h}</h3><p>${s.p}</p><span class="process-bottom-line"></span></article>`).join('')}
        </div></div></section>

        <section id="about" class="about-section section-padding section-anchor"><div class="container about-grid"><div class="about-brand-card"><div class="about-card-orbit orbit-one"></div><div class="about-card-orbit orbit-two"></div>${brandMark(true)}<div class="about-card-bottom"><span>ENGINEERING</span><span>×</span><span>TECHNOLOGY</span></div><span class="about-card-spark">✳</span></div><div class="about-copy">${heading(t.aboutEyebrow, t.aboutTitle, t.aboutTitleB, t.aboutText)}<ul class="about-check-list"><li>${icon('check', 19)}${t.aboutPointOne}</li><li>${icon('check', 19)}${t.aboutPointTwo}</li><li>${icon('check', 19)}${t.aboutPointThree}</li></ul><button class="text-link about-link" data-scroll="contact">${t.nav.contact}<span>${icon('arrow', 18)}</span></button></div></div></section>

        <section id="contact" class="contact-section section-anchor"><div class="container contact-container"><div class="contact-backdrop"><span></span><span></span><span></span></div><div class="contact-copy"><span class="eyebrow eyebrow--light"><span></span>${t.contactEyebrow}</span><h2>${t.contactTitle}<br><span>${t.contactTitleB}</span></h2><p>${t.contactDesc}</p><div class="contact-methods"><a href="tel:+${WHATSAPP_NUMBER}" class="contact-method"><span class="contact-method-icon">${icon('phone', 19)}</span><span><small>${t.callUs}</small><strong dir="ltr">${PHONE_DISPLAY}</strong></span>${icon('arrow', 17, 'contact-method-arrow')}</a><a href="${whatsappLink()}" target="_blank" rel="noreferrer" class="contact-method"><span class="contact-method-icon contact-method-icon--whatsapp">${icon('message', 19)}</span><span><small>${t.whatsappUs}</small><strong>WhatsApp</strong></span>${icon('arrow', 17, 'contact-method-arrow')}</a></div><div class="contact-label"><span class="live-dot"></span>${t.contactLabel}</div></div>
          <form class="contact-form" id="contact-form"><div class="form-topline"><span>${isAr ? 'ابدأ المحادثة' : 'Start a conversation'}</span><span class="form-mark">${brandMark(false, true)}</span></div><div class="form-row"><label>${t.formName}<input required name="name" data-form="name" value="${escapeAttr(draft.name)}" placeholder="${t.formNamePlaceholder}"></label><label>${t.formPhone}<input name="phone" inputmode="tel" data-form="phone" value="${escapeAttr(draft.phone)}" placeholder="${t.formPhonePlaceholder}"></label></div><label>${t.formSector}<span class="select-wrap"><select required data-form="sector"><option value="">${t.selectService}</option><option value="engineering" ${draft.sector === 'engineering' ? 'selected' : ''}>${t.engineering}</option><option value="technology" ${draft.sector === 'technology' ? 'selected' : ''}>${t.technology}</option></select>${icon('arrowDown', 17)}</span></label><label>${t.formMessage}<textarea required rows="4" data-form="message" placeholder="${t.formMessagePlaceholder}">${escapeHtml(draft.message)}</textarea></label><button class="button button--primary form-submit" type="submit">${t.sendWhatsApp}${icon('arrowLeft', 18)}</button><p class="form-privacy">${icon('shieldcheck', 15)}${t.formHint}</p></form>
        </div></section>
      </main>
      <footer class="site-footer"><div class="container footer-main"><div class="footer-brand"><a href="#home" data-scroll="home" aria-label="SKYPIEA home">${brandMark(true)}</a><p>${t.footerDesc}</p><div class="footer-tagline">${t.finalLine}</div></div><div class="footer-links"><h3>${t.quickLinks}</h3>${navLinks.map(item => `<button data-scroll="${item.id}">${item.label}${icon('arrow', 13)}</button>`).join('')}</div><div class="footer-links footer-sector-links"><h3>${t.sectorsFooter}</h3><button data-pick-sector="engineering">${t.engineering}${icon('arrow', 13)}</button><button data-pick-sector="technology">${t.technology}${icon('arrow', 13)}</button><a href="${whatsappLink()}" target="_blank" rel="noreferrer">WhatsApp ${icon('arrow', 13)}</a></div><div class="footer-contact"><span class="footer-contact-title">${t.contactLabel}</span><a href="tel:+${WHATSAPP_NUMBER}" dir="ltr">${icon('phone', 15)}${PHONE_DISPLAY}</a><a href="${whatsappLink()}" target="_blank" rel="noreferrer">${icon('message', 15)}${t.whatsappUs}</a><button data-language>${icon('globe', 15)}${isAr ? 'English' : 'العربية'}</button></div></div><div class="container footer-bottom"><span>© ${new Date().getFullYear()} SKYPIEA. ${t.rights}</span><span class="footer-bottom-line"></span><span>${isAr ? 'الهندسة × التكنولوجيا' : 'Engineering × Technology'}</span></div></footer>
      <a class="whatsapp-float" href="${whatsappLink()}" target="_blank" rel="noreferrer" aria-label="${t.whatsappUs}">${icon('message', 23)}<span>${isAr ? 'تواصل معنا' : 'Let’s talk'}</span></a>
    </div>`;
    attachEvents();
  }

  function escapeAttr(value) { return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escapeHtml(value) { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function saveDraft() {
    document.querySelectorAll('[data-form]').forEach((node) => { draft[node.dataset.form] = node.value; });
  }
  function updateServiceTabs() {
    const t = copy[language];
    document.querySelectorAll('[data-sector-tab]').forEach((button) => {
      const active = button.dataset.sectorTab === activeSector;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    const grid = document.getElementById('service-grid');
    if (grid) { grid.innerHTML = renderServiceCards(t); wireDiscussionButtons(); wireBenoButtons(); }
  }
  function scrollToSection(id) {
    mobileMenuOpen = false;
    const navEl = document.querySelector('.main-nav');
    const menuBtn = document.querySelector('[data-menu]');
    if (navEl) navEl.classList.remove('main-nav--open');
    if (menuBtn) menuBtn.innerHTML = icon('menu', 22);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function pickSector(value) {
    activeSector = value;
    updateServiceTabs();
    scrollToSection('services');
  }
  function wireDiscussionButtons() {
    document.querySelectorAll('[data-discuss-sector]').forEach((button) => button.addEventListener('click', () => {
      saveDraft(); draft.sector = button.dataset.discussSector || activeSector;
      const sectorSelect = document.querySelector('[data-form="sector"]');
      if (sectorSelect) sectorSelect.value = draft.sector;
      scrollToSection('contact');
    }));
  }
  function openBeno(source, prompt = '') {
    if (window.BenoChat && typeof window.BenoChat.open === 'function') {
      window.BenoChat.open(prompt ? `prompt:${prompt}` : source || 'company-landing-cta');
      return;
    }
    const launcher = document.querySelector('button.beno-launcher');
    if (launcher) launcher.click();
    else window.setTimeout(() => openBeno(source, prompt), 250);
  }
  function wireBenoButtons() {
    document.querySelectorAll('[data-beno-open]:not([data-beno-bound])').forEach((button) => {
      button.dataset.benoBound = 'true';
      button.addEventListener('click', () => openBeno(button.dataset.benoOpen, button.dataset.benoPrompt || ''));
    });
  }
  function attachEvents() {
    wireBenoButtons();
    document.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', () => {
      saveDraft(); language = language === 'ar' ? 'en' : 'ar'; render();
    }));
    document.querySelectorAll('[data-scroll]').forEach((button) => button.addEventListener('click', (event) => {
      event.preventDefault(); scrollToSection(button.dataset.scroll);
    }));
    document.querySelectorAll('[data-menu]').forEach((button) => button.addEventListener('click', () => {
      mobileMenuOpen = !mobileMenuOpen;
      document.querySelector('.main-nav')?.classList.toggle('main-nav--open', mobileMenuOpen);
      button.innerHTML = icon(mobileMenuOpen ? 'close' : 'menu', 22);
    }));
    document.querySelectorAll('[data-sector-tab]').forEach((button) => button.addEventListener('click', () => {
      activeSector = button.dataset.sectorTab; updateServiceTabs();
    }));
    document.querySelectorAll('[data-pick-sector]').forEach((button) => button.addEventListener('click', () => pickSector(button.dataset.pickSector)));
    wireDiscussionButtons();
    document.querySelectorAll('[data-form]').forEach((node) => node.addEventListener('input', () => { draft[node.dataset.form] = node.value; }));
    document.querySelectorAll('[data-form="sector"]').forEach((node) => node.addEventListener('change', () => { draft.sector = node.value; }));
    document.getElementById('contact-form')?.addEventListener('submit', (event) => {
      event.preventDefault(); saveDraft();
      const t = copy[language];
      const selectedSector = draft.sector === 'engineering' ? t.engineering : draft.sector === 'technology' ? t.technology : t.selectService;
      const message = language === 'ar'
        ? `مرحبًا SKYPIEA، أرغب في مناقشة خدمة جديدة.\n\nالاسم: ${draft.name.trim()}\nرقم التواصل: ${draft.phone.trim() || 'لم يُذكر'}\nالقطاع: ${selectedSector}\nتفاصيل المشروع: ${draft.message.trim()}`
        : `Hello SKYPIEA, I would like to discuss a new service.\n\nName: ${draft.name.trim()}\nContact number: ${draft.phone.trim() || 'Not provided'}\nSector: ${selectedSector}\nProject details: ${draft.message.trim()}`;
      window.open(whatsappLink(message), '_blank', 'noopener,noreferrer');
    });
  }

  window.addEventListener('scroll', () => {
    const header = document.getElementById('site-header');
    if (header) header.classList.toggle('site-header--scrolled', window.scrollY > 18);
  }, { passive: true });

  render();
})();
