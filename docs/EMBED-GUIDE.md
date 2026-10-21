# Embed Guide

## التضمين القياسي

```html
<script src="/beno/beno-chat.js" defer data-api="https://YOUR-API.example" data-brand="Beno" data-logo="/brand-mark.svg" data-accent="#156e68" data-whatsapp="201XXXXXXXXX" data-dir="rtl" data-position="left" data-autoopen="false" data-welcome="true" data-theme="auto"></script>
```

`beno-chat.js` و`beno-chat.chunk.js` يجب أن يكونا في المسار نفسه. الملف الأول صغير ولا ينفذ طلبات شبكة إلى API قبل فتح الشات؛ يتم تحميل chunk عند الفتح أو hover/touch. لا تستخدم روابط CDN خارجية في runtime.

| الخاصية | القيم |
|---|---|
| `data-api` | API base URL، فارغ لنفس الـ origin |
| `data-brand` | اسم العلامة |
| `data-logo` | URL لصورة العلامة (اختياري) |
| `data-accent` | لون accent بصيغة CSS |
| `data-whatsapp` | رقم بصيغة دولية دون `+` أو علامات |
| `data-dir` | `rtl` أو `ltr` |
| `data-position` | `left` أو `right` |
| `data-autoopen` | `true` أو `false`؛ تشغيل المحادثة الكاملة تلقائيًا عند `true` |
| `data-welcome` | `true` أو `false`؛ رسالة تعريفية صغيرة من Beno بعد فتح الصفحة، دون فتح المحادثة الكاملة |
| `data-theme` | `auto`, `light`, `dark` |

يسمح النظام بوجود `window.BenoChat` فقط كواجهة تكامل عامة. مثال: `window.BenoChat.open()` و`window.BenoChat.close()` و`window.BenoChat.configure({ accent: '#156e68' })`.

## WordPress

ارفع الملفين إلى مجلد واحد، ثم ألصق سطر script من `examples/wordpress-snippet/snippet.html` في أداة footer/header. اسمح للدومين عبر `ALLOWED_ORIGINS` إن كان الـ API على نطاق مختلف. لا تستخدم إضافة تضع مفاتيح Supabase على الصفحة.

## Next.js / React

استخدم `examples/next-demo/Widget.tsx` كمكوّن Client، وارفع الملفين إلى `public/beno/`. ركّبه مرة واحدة في root layout. لا تُنشئ عنصر script من server component ولا تركبه عدة مرات. لا تغيّر global CSS للموقع لاستيعاب الودجت.

## السلوك التلقائي

- `data-welcome="true"` (الافتراضي): يعرض رسالة ترحيب منسقة بعد نحو 1.9 ثانية، مرة واحدة في جلسة التصفح. يشرح الترحيب باختصار هوية Beno، ويتيح بدء المحادثة أو إخفاء الرسالة. لا يفتح لوحة المحادثة وحده. يمكن تعطيله عبر `data-welcome="false"`.
- `data-autoopen="true"`: يفتح المحادثة الكاملة بعد 4 ثوانٍ أو بعد تمرير 35% من الصفحة (الأسبق)، مرة واحدة كل 7 أيام وفق `localStorage`، مع منع الفتح عند الكتابة في حقل. إذا كان المطلوب ترحيبًا فقط دون فتح المحادثة تلقائيًا فاضبط `data-autoopen="false" data-welcome="true"`.
- إغلاق الترحيب أو بدء المحادثة يمنع تكراره في جلسة التصفح نفسها. `prefers-reduced-motion` يوقف الحركة غير الضرورية.

## تحديد المواقع

الافتراضي أسفل اليسار لصفحات RTL، مع safe-area على الموبايل. راجع ظهور CTA الصفحة، خصوصًا على الشاشات الصغيرة؛ يمكن تغيير `data-position`. الناشر مسؤول عن عدم وضع CTA مهم خلف نافذة الشات.
