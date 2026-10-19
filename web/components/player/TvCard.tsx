'use client';

// nightshift radio: the TV card holding the YouTube player (must stay visible,
// >=200x200). Drag it by its top bar anywhere on screen; the spot is remembered.
// Collapse hides the mood picker and extras but never the screen itself, and the
// screen element is never unmounted, so the playing video is not interrupted.

import { useEffect, useRef, useState } from 'react';
import MoodPicker from './MoodPicker';
import NsExtras from './NsExtras';

const KEY = 'nightshift-tv';

export default function TvCard() {
  const card = useRef<HTMLDivElement>(null);
  const [mini, setMini] = useState(false);

  // Position is written imperatively (no inline style props) and clamped to the viewport.
  const place = (x: number, y: number) => {
    const el = card.current; if (!el) return;
    const nx = Math.min(Math.max(4, x), window.innerWidth - el.offsetWidth - 4);
    const ny = Math.min(Math.max(4, y), window.innerHeight - el.offsetHeight - 4);
    el.style.left = `${nx}px`; el.style.top = `${ny}px`; el.style.right = 'auto'; el.style.bottom = 'auto';
    return { x: nx, y: ny };
  };
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null') as { x: number; y: number; mini?: boolean } | null;
      if (s) { place(s.x, s.y); if (s.mini) setMini(true); }
    } catch { /* storage blocked: keep the default corner */ }
    const onResize = () => { const el = card.current; if (el && el.style.left) place(el.offsetLeft, el.offsetTop); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const save = (extra: Partial<{ mini: boolean }> = {}) => {
    const el = card.current; if (!el) return;
    try { localStorage.setItem(KEY, JSON.stringify({ x: el.offsetLeft, y: el.offsetTop, mini, ...extra })); } catch { /* ignore */ }
  };

  const onDown = (e: React.PointerEvent) => {
    const el = card.current; if (!el) return;
    const dx = e.clientX - el.offsetLeft, dy = e.clientY - el.offsetTop;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => place(ev.clientX - dx, ev.clientY - dy);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); save(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  return (
    <div ref={card} aria-label="Now playing video" className="fixed right-3 bottom-12 z-[60] w-[216px] rounded-xl border border-line bg-bg p-1.5 shadow-xl">
      <div
        onPointerDown={onDown}
        className="mb-1 flex cursor-grab touch-none items-center justify-between font-mono text-[10px] tracking-[3px] text-muted uppercase select-none active:cursor-grabbing"
        title="Drag to move"
      >
        <span>⠿ NS-TV · CH 03</span>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => { const m = !mini; setMini(m); save({ mini: m }); }}
          className="rounded border border-line px-1 leading-4 hover:border-ink"
          aria-label={mini ? 'Show controls' : 'Hide controls'}
        >{mini ? '+' : '–'}</button>
      </div>
      <div className={mini ? 'hidden' : ''}><MoodPicker /></div>
      <div id="ns-tv-screen" className="h-[200px] w-[200px] overflow-hidden rounded-lg bg-black" />
      <div className={mini ? 'hidden' : ''}><NsExtras /></div>
    </div>
  );
}
