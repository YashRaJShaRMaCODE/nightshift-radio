'use client';

// nightshift radio: the TV card holding the YouTube player (must stay visible,
// >=200x200). Drag it by its top bar anywhere on screen; the spot is remembered.
// Collapse hides the mood picker and extras but never the screen itself, and the
// screen element is never unmounted, so the playing video is not interrupted.

import { useEffect, useRef, useState } from 'react';
import { moodLabel, station } from '@/lib/localStation';
import MoodPicker from './MoodPicker';
import NsExtras from './NsExtras';

const KEY = 'nightshift-tv';

export default function TvCard() {
  const card = useRef<HTMLDivElement>(null);
  const [mini, setMini] = useState(false);
  const [pocket, setPocket] = useState(false);
  const [big, setBig] = useState(false);
  const [, force] = useState(0);
  useEffect(() => station.subscribe(() => force(n => n + 1)), []);
  // Pocket: the whole station shrinks to one strip; an installed app window shrinks with it.
  const standalone = () => typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches;
  const togglePocket = () => {
    const on = !pocket; setPocket(on);
    const el = card.current;
    if (el) { el.style.left = ''; el.style.top = ''; el.style.right = ''; el.style.bottom = ''; }
    if (standalone()) {
      try { if (on) { window.resizeTo(640, 320); window.moveTo(screen.availWidth - 660, screen.availHeight - 340); } else { window.resizeTo(1280, 860); window.moveTo(40, 40); } } catch { /* not allowed */ }
    }
    // A maximized window ignores resizeTo; tell the listener how to get the small window.
    setTimeout(() => setBig(on && window.outerWidth > 900), 400);
    if (!on) { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null') as { x: number; y: number } | null; if (s) setTimeout(() => place(s.x, s.y), 50); } catch { /* ignore */ } }
  };
  const np = station.currentId ? station.title(station.currentId) : null;

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
    const el = card.current; if (!el || pocket) return;
    const dx = e.clientX - el.offsetLeft, dy = e.clientY - el.offsetTop;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => place(ev.clientX - dx, ev.clientY - dy);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); save(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  return (
    <>
    {pocket && (
      <div className="fixed inset-0 z-[55] flex items-center justify-center bg-bg font-mono text-[11px] tracking-[1px] text-muted">
        <div className="flex h-[236px] w-[600px] max-w-full items-center gap-3 pr-2 pl-[232px]">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] text-ink">{np?.title || 'nightshift radio'}</div>
            <div className="truncate uppercase">{np?.artist ? `${np.artist} · ` : ''}{moodLabel(station.mood)}</div>
            {big && <div className="mt-2 normal-case">Tip: un-maximize this window (restore button) and pocket shrinks the window too.</div>}
          </div>
          <div className="flex shrink-0 gap-1">
            <button onClick={() => (station.status === 'playing' ? station.pause() : void station.tune())} className="rounded-md border border-line px-2 py-1 text-ink hover:border-ink" aria-label="Play or pause">
              {station.status === 'playing' ? '❚❚' : '▶'}</button>
            {station.canSkip && <button onClick={() => void station.previous()} className="rounded-md border border-line px-2 py-1 text-ink hover:border-ink" aria-label="Previous song">⏮</button>}
            <button onClick={() => void station.refresh()} disabled={station.status !== 'playing'} className="rounded-md border border-line px-2 py-1 text-ink hover:border-ink disabled:opacity-40" aria-label="Refresh: swap this song" title="Don't like this song? Swap it">↻</button>
            {station.canSkip && <button onClick={() => void station.next()} className="rounded-md border border-line px-2 py-1 text-ink hover:border-ink" aria-label="Next song">⏭</button>}
            <button onClick={togglePocket} className="rounded-md border border-line px-2 py-1 text-ink hover:border-ink" aria-label="Leave pocket mode">⤢</button>
          </div>
        </div>
      </div>
    )}
    <div ref={card} aria-label="Now playing video" className={pocket ? 'fixed top-1/2 left-[max(8px,calc(50%-300px))] z-[60] w-[216px] -translate-y-1/2 rounded-xl border border-line bg-bg p-1.5' : 'fixed right-3 bottom-12 z-[60] w-[216px] rounded-xl border border-line bg-bg p-1.5 shadow-xl'}>
      <div
        onPointerDown={onDown}
        className="mb-1 flex cursor-grab touch-none items-center justify-between font-mono text-[10px] tracking-[3px] text-muted uppercase select-none active:cursor-grabbing"
        title="Drag to move"
      >
        <span>⠿ NS-TV · CH 03</span>
        <span className="flex gap-1">
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={togglePocket}
          className="rounded border border-line px-1 leading-4 hover:border-ink"
          aria-label={pocket ? 'Leave pocket mode' : 'Pocket mode'}
          title="Pocket mode: shrink to one strip"
        >{pocket ? '⤢' : '▭'}</button>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => { const m = !mini; setMini(m); save({ mini: m }); }}
          className="rounded border border-line px-1 leading-4 hover:border-ink"
          aria-label={mini ? 'Show controls' : 'Hide controls'}
        >{mini ? '+' : '–'}</button>
        </span>
      </div>
      <div className={mini || pocket ? 'hidden' : ''}><MoodPicker /></div>
      <div id="ns-tv-screen" className="h-[200px] w-[200px] overflow-hidden rounded-lg bg-black" />
      <div className={mini || pocket ? 'hidden' : 'mt-1 flex gap-1 font-mono text-[10px] tracking-[2px] text-muted uppercase'}>
        {station.canSkip && <button onClick={() => void station.previous()} className="rounded border border-line px-2 py-1 hover:border-ink hover:text-ink" aria-label="Previous song" title="Previous song">⏮</button>}
        <button onClick={() => void station.refresh()} disabled={station.status !== 'playing'} className="flex-1 rounded border border-line px-2 py-1 hover:border-ink hover:text-ink disabled:opacity-40" aria-label="Refresh: swap this song" title="Don't like this song? Swap it">↻ Refresh</button>
        {station.canSkip && <button onClick={() => void station.next()} className="rounded border border-line px-2 py-1 hover:border-ink hover:text-ink" aria-label="Next song" title="Next song">⏭</button>}
      </div>
      <div className={mini || pocket ? 'hidden' : ''}><NsExtras /></div>
    </div>
    </>
  );
}
