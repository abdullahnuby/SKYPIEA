# Next.js / React example

Copy `beno-chat.js` and `beno-chat.chunk.js` to `public/beno/` then change `s.src` in `Widget.tsx` to `/beno/beno-chat.js`. Render `<BenoChatWidget />` once in the root layout. Keep the API on the same origin or set `data-api` / configure `ALLOWED_ORIGINS` and CORS. Ensure the script stays out of server-side rendering. The component uses only DOM APIs after mount.
