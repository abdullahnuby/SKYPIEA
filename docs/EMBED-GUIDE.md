# Embed Guide

## التضمين القياسي

```html
<script src="/beno/beno-chat.js" defer data-api="https://YOUR-API.example" data-brand="Beno" data-logo="/brand-mark.svg" data-accent="#156e68" data-whatsapp="201XXXXXXXXX" data-dir="rtl" data-position="left" data-autoopen="true" data-theme="auto"></script>
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
| `data-autoopen` | `true` أو `false` |
| `data-theme` | `auto`, `light`, `dark` |

يسمح النظام بوجود `window.BenoChat` فقط كواجهة تكامل عامة. مثال: `window.BenoChat.open()` و`window.BenoChat.close()` و`window.BenoChat.configure({ accent: '#156e68' })`.

## WordPress

ارفع الملفين إلى مجلد واحد، ثم ألصق سطر script من `examples/wordpress-snippet/snippet.html` في أداة footer/header. اسمح للدومين عبر `ALLOWED_ORIGINS` إن كان الـ API على نطاق مختلف. لا تستخدم إضافة تضع مفاتيح Supabase على الصفحة.

## Next.js / React

استخدم `examples/next-demo/Widget.tsx` كمكوّن Client، وارفع الملفين إلى `public/beno/`. ركّبه مرة واحدة في root layout. لا تُنشئ عنصر script من server component ولا تركبه عدة مرات. لا تغيّر global CSS للموقع لاستيعاب الودجت.

## السلوك التلقائي

يفتح بعد 4 ثوانٍ أو بعد 35% من تمرير الصفحة (الأسبق) مرة واحدة كل 7 أيام، إلا عند تركيز الكتابة في حقل، أو عند إغلاق سابق داخل نفس نافذة السبعة أيام. التخزين في `localStorage` مع `try/catch`. `prefers-reduced-motion` يوقف الحركة غير الضرورية.

## تحديد المواقع

الافتراضي أسفل اليسار لصفحات RTL، مع safe-area على الموبايل. راجع ظهور CTA الصفحة، خصوصًا على الشاشات الصغيرة؛ يمكن تغيير `data-position`. الناشر مسؤول عن عدم وضع CTA مهم خلف نافذة الشات.
