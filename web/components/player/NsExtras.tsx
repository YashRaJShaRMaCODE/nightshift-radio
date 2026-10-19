'use client';

// nightshift radio extras on the TV card: synced lyrics, dedications, sleep timer
// and alarm, auto mood, the last 24 hours, and a shareable weekly Wrapped card.

import { useEffect, useRef, useState } from 'react';
import { station } from '@/lib/localStation';

type Tab = 'search' | 'lyrics' | 'dedicate' | 'timer' | 'history' | 'wrapped' | null;
const TABS: [Exclude<Tab, null>, string][] = [['search', 'Search'], ['lyrics', 'Lyrics'], ['dedicate', 'Dedicate'], ['timer', 'Sleep'], ['history', '24h'], ['wrapped', 'Wrapped']];
const btn = 'rounded-md border border-line px-1.5 py-0.5 hover:border-ink';

function Search() {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<{ id: string; title: string; channel: string; length: string }[] | null>(null);
  const go = async (e: React.FormEvent) => { e.preventDefault(); if (!q.trim()) return; setBusy(true); setHits(await station.search(q)); setBusy(false); };
  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={go} className="flex gap-1">
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="song or artist, e.g. Brown Munde"
          className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1 text-ink" />
        <button className={btn}>{busy ? '…' : 'Go'}</button>
      </form>
      {hits && !hits.length && <p>Nothing found. Try another spelling.</p>}
      <ul className="max-h-60 overflow-y-auto pr-1">
        {hits?.map(h => (
          <li key={h.id}>
            <button onClick={() => void station.playNow(h.id, h.title)} className="flex w-full items-center gap-2 border-b border-line py-1 text-left hover:text-ink">
              <img src={`https://i.ytimg.com/vi/${h.id}/default.jpg`} alt="" className="h-8 w-11 shrink-0 rounded object-cover" />
              <span className="min-w-0 flex-1"><span className="block truncate text-ink">{h.title}</span><span className="block truncate">{h.channel} · {h.length}</span></span>
              <span className="shrink-0">▶</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="text-muted">Tap to play now. It also joins My Station.</p>
    </div>
  );
}

function Lyrics() {
  const [lines, setLines] = useState<{ t: number; l: string }[] | null | undefined>(undefined);
  const [now, setNow] = useState(0);
  const id = station.currentId;
  useEffect(() => { setLines(undefined); if (id) void station.lyrics(id).then(setLines); }, [id]);
  useEffect(() => { const t = setInterval(() => setNow(station.elapsed()), 400); return () => clearInterval(t); }, []);
  const box = useRef<HTMLDivElement>(null);
  const cur = lines ? lines.reduce((k, x, i) => (x.t >= 0 && x.t <= now + 0.3 ? i : k), -1) : -1;
  useEffect(() => { box.current?.querySelector('[data-cur]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [cur]);
  if (!id) return <p>Tune in first.</p>;
  if (lines === undefined) return <p>Finding lyrics…</p>;
  if (!lines) return <p>No lyrics found for this one.</p>;
  return (
    <div ref={box} className="max-h-56 overflow-y-auto pr-1">
      {lines.map((x, i) => (
        <p key={i} data-cur={i === cur ? '' : undefined} className={i === cur ? 'py-0.5 text-[13px] text-ink' : 'py-0.5 text-muted'}>{x.l}</p>
      ))}
    </div>
  );
}

function Dedicate() {
  const [v, setV] = useState('');
  return (
    <form onSubmit={e => { e.preventDefault(); if (v.trim()) { station.dedicate(v); setV(''); } }} className="flex flex-col gap-2">
      <p>Write who it&apos;s for. The DJ reads it on air before the next song.</p>
      <input value={v} onChange={e => setV(e.target.value)} placeholder="for Simran, happy birthday" maxLength={140}
        className="rounded-md border border-line bg-bg px-2 py-1 text-ink" />
      <button className={btn}>Send to the booth</button>
    </form>
  );
}

function Timer() {
  const [alarm, setAlarm] = useState(station.alarmAt ?? '07:00');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);
  const left = station.sleepAt ? Math.max(0, Math.round((station.sleepAt - now) / 60000)) : null;
  return (
    <div className="flex flex-col gap-2">
      <p>Sleep timer {left !== null ? `· ${left} min left` : ''}</p>
      <div className="flex flex-wrap gap-1">{[15, 30, 60, 0].map(m => <button key={m} className={btn} onClick={() => station.sleep(m)}>{m ? `${m}m` : 'Off'}</button>)}</div>
      <p>Alarm {station.alarmAt ? `· set for ${station.alarmAt}` : ''} <span className="text-muted">(keep this tab open)</span></p>
      <div className="flex gap-1">
        <input type="time" value={alarm} onChange={e => setAlarm(e.target.value)} className="rounded-md border border-line bg-bg px-1 text-ink" />
        <button className={btn} onClick={() => station.alarm(alarm)}>Set</button>
        <button className={btn} onClick={() => station.alarm(null)}>Off</button>
      </div>
      <label className="flex items-center gap-2"><input type="checkbox" checked={station.autoMood} onChange={e => station.setAutoMood(e.target.checked)} />
        Auto mood by time &amp; weather</label>
    </div>
  );
}

function History() {
  const rows = station.history24();
  if (!rows.length) return <p>Nothing yet. Songs you hear show up here.</p>;
  return (
    <ul className="max-h-56 overflow-y-auto pr-1">
      {rows.map(x => { const t = station.title(x.id); return (
        <li key={x.at} className="flex justify-between gap-2 border-b border-line py-1">
          <span className="truncate text-ink">{t.title || x.id}<span className="text-muted">{t.artist ? ` · ${t.artist}` : ''}</span></span>
          <a className="shrink-0 underline" href={`https://www.youtube.com/watch?v=${x.id}`} target="_blank" rel="noreferrer">
            {new Date(x.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ↗</a>
        </li>); })}
    </ul>
  );
}

function Wrapped() {
  const w = station.wrapped();
  const share = () => {
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const g = c.getContext('2d')!;
    const css = getComputedStyle(document.documentElement), col = (k: string, f: string) => css.getPropertyValue(k).trim() || f;
    g.fillStyle = col('--bg', '#0b0b10'); g.fillRect(0, 0, 1080, 1350); g.fillStyle = col('--accent', '#ff3fd8');
    g.font = 'bold 54px monospace'; g.fillText('NIGHTSHIFT RADIO · WRAPPED', 80, 160);
    g.fillStyle = col('--ink', '#e6fbff'); g.font = 'bold 150px serif'; g.fillText(w.minutes < 60 ? `${w.minutes}m` : `${w.hours}h`, 80, 400);
    g.font = '44px monospace';
    [`listened this week · ${w.songs} songs`, '', 'TOP ARTIST', w.artist || '—', '', 'TOP MOOD', w.mood, '', 'ON REPEAT', w.song || '—']
      .forEach((t, i) => g.fillText(t.slice(0, 38), 80, 500 + i * 70));
    const a = document.createElement('a'); a.download = 'nightshift-wrapped.png'; a.href = c.toDataURL('image/png'); a.click();
  };
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[20px] text-ink">{w.minutes < 60 ? `${w.minutes} min` : `${w.hours} hours`} · {w.songs} songs</p>
      <p>Top artist: <span className="text-ink">{w.artist || '—'}</span></p>
      <p>Top mood: <span className="text-ink">{w.mood}</span></p>
      <p>On repeat: <span className="text-ink">{w.song || '—'}</span></p>
      <button className={btn} onClick={share}>Save share card</button>
    </div>
  );
}

export default function NsExtras() {
  const [tab, setTab] = useState<Tab>(null);
  const root = useRef<HTMLDivElement>(null);
  // Close the open panel on a click anywhere outside it, or on Escape.
  useEffect(() => {
    if (!tab) return;
    const out = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setTab(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setTab(null); };
    document.addEventListener('pointerdown', out); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', out); document.removeEventListener('keydown', esc); };
  }, [tab]);
  const [, force] = useState(0);
  useEffect(() => station.subscribe(() => force(n => n + 1)), []);
  return (
    <div ref={root} className="relative z-30 mt-1.5 font-mono text-[10px] tracking-[1px] text-muted">
      {tab && (
        <div className="absolute right-0 bottom-full z-30 mb-2 w-72 rounded-xl border border-line bg-bg p-3 text-[11px] normal-case shadow-xl">
          {tab === 'search' && <Search />}{tab === 'lyrics' && <Lyrics />}{tab === 'dedicate' && <Dedicate />}{tab === 'timer' && <Timer />}
          {tab === 'history' && <History />}{tab === 'wrapped' && <Wrapped />}
        </div>
      )}
      <div className="flex flex-wrap gap-1 uppercase">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(tab === k ? null : k)} className={tab === k ? `${btn} border-ink text-ink` : btn}>{label}</button>
        ))}
      </div>
    </div>
  );
}
