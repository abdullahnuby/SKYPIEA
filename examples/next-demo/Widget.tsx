'use client';
import { useEffect } from 'react';
/** Put the built client files in /public/beno/ and mount once from app/layout.tsx. */
export default function BenoChatWidget() {
  useEffect(() => {
    if (document.querySelector('script[data-beno-chat]')) return;
    const s = document.createElement('script');
    s.src = '/beno/beno-chat.js'; s.defer = true; s.dataset.benoChat = 'true';
    s.dataset.api = ''; s.dataset.brand = 'بينو'; s.dataset.accent = '#156e68'; s.dataset.dir = 'rtl';
    document.body.appendChild(s);
    return () => { s.remove(); document.querySelector('[data-beno-chat-root]')?.remove(); delete (window as Window & { BenoChat?: unknown }).BenoChat; };
  }, []);
  return null;
}
