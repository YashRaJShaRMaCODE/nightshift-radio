'use client';

// nightshift radio: an in-browser station that answers the same shapes the
// SUB/WAVE controller serves (/now-playing, /state, /session, /schedule, ...),
// but plays music through the YouTube IFrame player instead of an Icecast
// stream. The player must stay visible (YouTube terms), so it lives in a small
// on-screen TV (#ns-tv) rendered by PlayerShell.

import type { Theme } from '@/lib/theme';
import type {
  NowPlayingResponse, QueueEntry, RequestResult, SchedulePayload, SessionPayload, SessionTurn, StationState,
} from '@/lib/types';
import { TAIL, onAir, type Song as NsSong } from './nsSchedule';
import SONGS from './stationSongs.json';
import { listTracks, type LocalTrack } from './offlineLib';
import blueprint from './themes/blueprint.json';
import classicDark from './themes/classic-dark.json';
import classicLight from './themes/classic-light.json';
import cyberpunk from './themes/cyberpunk.json';
import flare from './themes/flare.json';
import recon from './themes/recon.json';
import signal from './themes/signal.json';
import vinyl from './themes/vinyl.json';

export const STATION_NAME = 'nightshift radio';
export const THEMES = [blueprint, classicDark, classicLight, cyberpunk, flare, recon, signal, vinyl] as Theme[];
const TZ = 'Asia/Kolkata';

// ---------- mood stations: each one is its own synced broadcast ----------
export const MOODS: [id: string, label: string][] = [
  ['mine', 'My Station'], ['local', 'Offline · My Files'], ['trending', 'Trending'], ['romantic', 'Romantic'], ['sad', 'Heartbreak'], ['bhangra', 'Bhangra Party'],
  ['gym', 'Gym Mode'], ['lofi', 'Lo-fi Chill'], ['retro', '90s Retro'], ['rap', 'Punjabi Rap'],
  ['wedding', 'Shaadi Season'], ['sufi', 'Sufi Soul'], ['drive', 'Long Drive'], ['night', 'Late Night'],
  ['haryanvi', 'Haryanvi'], ['english', 'English Hits'], ['bollywood', 'Bollywood'], ['oldhindi', 'Old Hindi'],
];
const LIB = SONGS as { songs: Record<string, number>; moods: Record<string, string[]> };
const MIXES: Record<string, string[]> = { night: ['lofi', 'romantic', 'sad', 'sufi'] };
const moodList = (m: string): NsSong[] => {
  const ids = MIXES[m] ? MIXES[m]!.flatMap(x => LIB.moods[x] ?? []) : LIB.moods[m] ?? [];
  const list = [...new Set(ids)].filter(id => LIB.songs[id]).map(id => ({ id, d: LIB.songs[id]! }));
  return list.length ? list : Object.entries(LIB.songs).map(([id, d]) => ({ id, d }));
};
const MOOD_THEME: Record<string, string> = { sad: 'blueprint', bhangra: 'flare', sufi: 'vinyl', lofi: 'classic-dark', night: 'cyberpunk',
  romantic: 'classic-light', retro: 'recon', rap: 'signal', gym: 'flare', wedding: 'vinyl', drive: 'cyberpunk', trending: 'classic-dark', mine: 'classic-dark', local: 'vinyl',
  haryanvi: 'flare', english: 'classic-light', bollywood: 'recon', oldhindi: 'vinyl' };
export const moodLabel = (m: string) => MOODS.find(x => x[0] === m)?.[1] ?? 'Trending';

// stationSongs.json: ~680 Punjabi hits harvested once from public YouTube playlists.

// ---------- shows & hosts (hour-of-day schedule) ----------
const PERSONAS = [
  { id: 'meher', name: 'Meher', tagline: 'morning chai, soft starts', avatar: '' },
  { id: 'heer', name: 'Heer', tagline: 'focus, calm, flow', avatar: '' },
  { id: 'kabir', name: 'Love', tagline: 'windows down, volume up', avatar: '' },
  { id: 'noor', name: 'Noor', tagline: 'after-dark selector', avatar: '' },
];
const SHOWS = [
  { id: 'chai', name: 'Morning Chai', topic: 'easing into the day', mood: 'warm', moods: ['warm', 'acoustic'], personaId: 'meher', from: 5, energy: 'low' as const },
  { id: 'deep', name: 'Deep Work', topic: 'staying in the zone', mood: 'focus', moods: ['focus', 'calm'], personaId: 'heer', from: 11, energy: 'medium' as const },
  { id: 'drive', name: 'Evening Drive', topic: 'the ride home', mood: 'upbeat', moods: ['upbeat', 'drive'], personaId: 'kabir', from: 17, energy: 'high' as const },
  { id: 'night', name: 'The Night Shift', topic: 'late-night company', mood: 'night', moods: ['night', 'mellow'], personaId: 'noor', from: 21, energy: 'low' as const },
];
const hourNow = () => Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: TZ }));
const showAt = (h: number) => [...SHOWS].reverse().find(s => h >= s.from) ?? SHOWS[3]!;
const currentShow = () => showAt(hourNow());
const personaOf = (s = currentShow()) => PERSONAS.find(p => p.id === s.personaId)!;
const LINES: Record<string, string[]> = {
  chai: ['Chai in one hand, the day in the other.', 'Easy does it. The day can wait one more song.'],
  deep: ['Keep your shoulders down and your tabs few.', 'One task at a time. I will keep the music going.'],
  drive: ['Windows down, volume up.', 'Work is done. This one is for the ride home.'],
  night: ['Low lights, slow songs. Stay a while.', 'Still up? Good. So is the station.'],
};

// ---------- saved taste ----------
interface Song { title: string; likes: number; plays: number }
interface Saved { songs: Record<string, Song>; banned: string[]; seeded?: boolean; volume?: number; seedIds?: string[]; mood?: string;
  /** My Station: songs from the listener's own playlists, and YouTube Mix picks grown from their likes. */
  mine?: string[]; mix?: string[];
  /** Listening log for history and Wrapped: song id, start time, mood, seconds heard. */
  log?: { id: string; at: number; mood: string; s: number }[]; autoMood?: boolean }
const KEY = 'nightshift-radio';
const load = (): Saved => { try { return { songs: {}, banned: [], ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { songs: {}, banned: [] }; } };

// ---------- helpers ----------
/** "Artist - Song" or "Song - Artist"? Featured credits and the channel name decide which side is the artist. */
export function parseTitle(t = '', channel = '') {
  const clean = t.replace(/\s*[([].*?(official|offical|video|audio|visuali[sz]er|lyric|4k|hd|full song|latest|new punjabi).*?[)\]]/gi, '').replace(/\s*\|.*$/, '').trim();
  const parts = clean.split(/\s[-–]\s/).filter(x => !/^(official|offical)?\s*(music\s*)?(video|audio|visualizer|lyrics?)$/i.test(x.trim()));
  if (parts.length < 2) return { artist: '', title: (parts[0] ?? clean).trim() };
  const [a, b] = [parts[0]!.trim(), parts.slice(1).join(' - ').trim()];
  const ch = channel.toLowerCase().replace(/\s*(official|music|records|vevo|- topic)\s*/g, '').trim();
  const looksArtist = (x: string) => /\b(?:ft|feat)\b\.?|\bx\b|&|,/i.test(x) || (!!ch && x.toLowerCase().includes(ch));
  return looksArtist(b) && !looksArtist(a) ? { artist: b, title: a } : { artist: a, title: b };
}
const iso = (ms = Date.now()) => new Date(ms).toISOString();

type YTPlayer = {
  loadVideoById(id: string): void; pauseVideo(): void; playVideo(): void; stopVideo(): void; setVolume(v: number): void;
  getVideoData(): { title: string }; getDuration(): number; getCurrentTime(): number; getPlaylist(): string[] | null; destroy(): void;
};
type YTNs = { Player: new (el: HTMLElement | string, o: object) => YTPlayer; PlayerState: Record<string, number> };
declare global { interface Window { YT?: YTNs; onYouTubeIframeAPIReady?: () => void } }

let ytReady: Promise<YTNs> | null = null;
function loadYT(): Promise<YTNs> {
  if (ytReady) return ytReady;
  ytReady = new Promise(res => {
    if (window.YT?.Player) return res(window.YT);
    window.onYouTubeIframeAPIReady = () => res(window.YT!);
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s);
  });
  return ytReady;
}

// ---------- the station ----------
export type EngineStatus = 'idle' | 'connecting' | 'playing' | 'paused';

class LocalStation {
  private saved: Saved = { songs: {}, banned: [] };
  private yt: YTNs | null = null;
  private subs = new Set<() => void>();
  status: EngineStatus = 'idle';
  volume = 0.8;
  current: (QueueEntry & { id: string; duration?: number }) | null = null;
  upcoming: string[] = [];
  history: QueueEntry[] = [];
  messages: SessionTurn[] = [];
  private requests = new Map<string, RequestResult>();
  private weather: { condition?: string; temp?: number; location?: string } = {};
  private started = false;
  private seeding: Promise<void> = Promise.resolve();

  init() {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    this.saved = load();
    this.volume = this.saved.volume ?? 0.8;
    this.fetchWeather();
    this.say(`Station's warm. ${STATION_NAME}, ${currentShow().name} with ${personaOf().name}. Press play whenever you're ready.`, false);
    this.seeding = this.seed();
    this.mood = this.saved.mood && MOODS.some(m => m[0] === this.saved.mood) ? this.saved.mood : 'trending';
    this.syncClock();
    void this.reloadTracks();
    window.addEventListener('offline', () => { if (this.mood !== 'local' && this.tracks.length) { this.setMood('local'); void this.say('Network dropped. Switching to your own files.', false); } });
  }
  mood = 'trending';
  /** Device clock correction (ms) against the server, so drifting phones still hear the same moment. */
  private skew = 0;
  private now() { return Date.now() + this.skew; }
  private syncClock() {
    const t0 = Date.now();
    fetch('/ns/time', { cache: 'no-store' }).then(r => r.json()).then((d: { now: number }) => {
      const t1 = Date.now(); if (t1 - t0 < 3000) this.skew = d.now - (t0 + t1) / 2;
    }).catch(() => {});
  }
  setMood(m: string) {
    if (m === this.mood || !MOODS.some(x => x[0] === m)) return;
    this.mood = m; this.saved.mood = m; this.save(); this.upcoming = []; this.emit();
    if (m === 'local') { if (this.status !== 'idle') { this.decks.forEach(d => d.stopVideo()); if (this.boundary) clearTimeout(this.boundary); if (this.preroll) clearTimeout(this.preroll); void this.localNext(false); } return; }
    if (this.localCur) { this.stopLocal(); if (this.status !== 'idle') { this.status = 'connecting'; void this.tune(); } return; }
    if (this.status !== 'idle' && this.decks.length) {
      const sl = this.slot(), at = m === 'mine' ? 0 : sl.offset;
      const hint = m === 'mine' && !this.minePool().length ? ' Paste your own playlist link in Request, or tap Keep on songs you love, and this becomes yours.' : '';
      void this.crossTo(sl.id, at, false, `Switching to ${moodLabel(m)}.${hint}`);
    }
  }
  subscribe(fn: () => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  private emit() { this.subs.forEach(f => f()); }
  private save() { try { localStorage.setItem(KEY, JSON.stringify({ ...this.saved, volume: this.volume })); } catch { /* storage blocked */ } }

  private fetchWeather() {
    const go = (lat: number, lon: number, location: string) =>
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`)
        .then(r => r.json()).then(d => {
          const w = d.current.weather_code as number;
          const condition = w === 0 ? 'clear' : w < 4 ? 'cloudy' : w < 50 ? 'foggy' : w < 70 ? 'rainy' : w < 80 ? 'snowy' : 'stormy';
          this.weather = { condition, temp: Math.round(d.current.temperature_2m), location }; this.emit();
        }).catch(() => {});
    navigator.geolocation?.getCurrentPosition(p => go(p.coords.latitude, p.coords.longitude, ''), () => go(28.61, 77.21, 'Delhi'), { timeout: 5000 });
  }

  // ---------- two-deck player: the next song is cued on the idle deck and crossfaded in ----------
  // Both decks live inside the visible TV (YouTube terms); the live deck sits on top.
  private decks: YTPlayer[] = [];
  private live = 0;
  private deckEls: HTMLElement[] = [];
  private get player(): YTPlayer | null { return this.decks[this.live] ?? null; }
  private async ensurePlayer(): Promise<YTPlayer | null> {
    if (this.decks.length) return this.player;
    const host = document.getElementById('ns-tv-screen');
    if (!host) return null;
    host.style.position = 'relative';
    this.yt = await loadYT();
    for (let i = 0; i < 2; i++) {
      const wrap = document.createElement('div'); wrap.style.cssText = 'position:absolute;inset:0;transition:opacity 1.2s';
      const mount = document.createElement('div'); wrap.appendChild(mount); host.appendChild(wrap); this.deckEls.push(wrap);
      await new Promise<void>(res => {
        this.decks[i] = new this.yt!.Player(mount, {
          width: '100%', height: '100%', playerVars: { controls: 0, rel: 0, playsinline: 1, disablekb: 1 },
          events: { onReady: () => res(), onStateChange: (e: { data: number }) => this.onState(i, e.data), onError: () => this.onDeckError(i) },
        });
      });
    }
    this.showDeck(0);
    return this.player;
  }
  private showDeck(i: number) { this.deckEls.forEach((el, k) => { el.style.opacity = k === i ? '1' : '0'; el.style.zIndex = k === i ? '2' : '1'; }); }
  private deckVol = [1, 1];
  private setDeckVol(i: number, v: number) { this.deckVol[i] = v; const d = this.decks[i]; if (d && typeof d.setVolume === 'function') d.setVolume(Math.round(v * this.volume * 100)); }
  private ramp(i: number, to: number, ms: number): Promise<void> {
    const from = this.deckVol[i] ?? 1, steps = Math.max(1, Math.round(ms / 80));
    return new Promise(res => { let k = 0; const t = setInterval(() => { k++; this.setDeckVol(i, from + (to - from) * (k / steps)); if (k >= steps) { clearInterval(t); res(); } }, 80); });
  }

  private onState(deck: number, s: number) {
    if (deck !== this.live) return;
    const S = this.yt!.PlayerState;
    if (s === S.PLAYING) { this.status = 'playing'; this.onPlaying(); this.keepAwake(); this.clearBuffering(); }
    else if (s === S.BUFFERING) this.watchBuffering();
    else if (s === S.PAUSED && !this.fading && !this.userPaused && this.status !== 'idle') {
      // Paused from the TV itself (a click on the video): it's live radio, so resume where the broadcast is now.
      const sl = this.slot(), p = this.player as unknown as { seekTo(t: number, a: boolean): void; playVideo(): void };
      if (!this.onRequest && this.current?.id === sl.id) p.seekTo(Math.floor(sl.offset), true);
      p.playVideo(); return;
    }
    else if (s === S.ENDED) { this.onEnded(); return; }
    this.emit();
  }
  private onDeckError(deck: number) {
    // Unplayable embed: every listener hits the same wall, so all fall back to the same neighbour.
    if (deck !== this.live || !this.current) return;
    this.saved.banned.push(this.current.id); this.save();
    void this.crossTo(this.slot().next, 0, false);
  }
  private onEnded() {
    // Request finished: rejoin the broadcast. Song shorter than its slot: the DJ fills the gap.
    if (this.onRequest) { void this.crossTo(this.slot().id, this.slot().offset, true); return; }
    if (this.slot().msLeft > 4000) void this.djLine(this.current, this.slot().next).then(t => this.say(t));
  }

  private onPlaying() {
    const p = this.player!, d = p.getVideoData(), id = this.current?.id;
    if (!id) return;
    const song = (this.saved.songs[id] ??= { title: '', likes: 0, plays: 0 });
    if (d.title && song.title !== d.title) { song.title = d.title; this.save(); }
    const { title, artist } = parseTitle(song.title, (d as { author?: string }).author);
    if (!this.current!.startedAt) {
      this.current = { ...this.current!, title, artist, startedAt: iso(), duration: p.getDuration() || undefined };
      song.plays++;
      const log = (this.saved.log ??= []); const last = log[log.length - 1];
      if (last) last.s = Math.min(last.s || 0, Math.round((Date.now() - last.at) / 1000)) || Math.round((Date.now() - last.at) / 1000);
      log.push({ id, at: Date.now(), mood: this.mood, s: 0 });
      this.saved.log = log.filter(x => Date.now() - x.at < 35 * 86400000).slice(-3000); this.save();
      if (this.history[0]?.subsonic_id !== id) this.history.unshift({ title, artist, subsonic_id: id, startedAt: this.current.startedAt });
      this.history = this.history.slice(0, 30);
      this.cue();
      if (this.mood === 'mine' && !this.onRequest) {
        this.arm();
        void this.harvest('RD' + id).then(ids => { if (this.current?.id === id) { this.chain = ids.filter(x => x !== id).slice(0, 20); this.mineNext = ''; this.cue(); } });
      }
      if ('mediaSession' in navigator) {
        const ms = navigator.mediaSession;
        ms.metadata = new MediaMetadata({ title, artist: artist || moodLabel(this.mood), album: `${STATION_NAME} · ${moodLabel(this.mood)}`,
          artwork: [{ src: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, sizes: '480x360', type: 'image/jpeg' },
            { src: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, sizes: '1280x720', type: 'image/jpeg' }] });
        ms.playbackState = 'playing';
        ms.setActionHandler('play', () => void this.tune());
        ms.setActionHandler('pause', () => this.pause());
        ms.setActionHandler('nexttrack', () => void this.next());
        ms.setActionHandler('stop', () => this.stop());
      }
    } else if (!this.current!.title) this.current = { ...this.current!, title, artist };
  }

  private cue() { const n = this.slot().next; if (!this.upcoming.includes(n)) this.upcoming.push(n); void this.fillTitle(n); }
  // Free, keyless title lookup so cued/history rows show real names before the song airs.
  private async fillTitle(id?: string) {
    if (!id) return; const s = (this.saved.songs[id] ??= { title: '', likes: 0, plays: 0 });
    if (s.title) return;
    try { const d = await (await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`)).json();
      if (d.title) { s.title = d.title; this.save(); this.emit(); } } catch { /* offline */ }
  }

  private say(text: string, speak = true): Promise<void> {
    const now = iso();
    this.messages.push({ t: now, role: 'segment', kind: 'link', text, meta: { airedAt: now, personaName: personaOf().name } });
    this.messages = this.messages.slice(-40); this.emit();
    if (!speak || typeof speechSynthesis === 'undefined') return Promise.resolve();
    return new Promise(res => {
      const u = new SpeechSynthesisUtterance(text); u.rate = 1.02; u.pitch = 0.9; u.volume = Math.min(1, this.volume + 0.15);
      const v = speechSynthesis.getVoices(); u.voice = v.find(x => /en-IN/.test(x.lang)) || v.find(x => /en-GB/.test(x.lang)) || null;
      u.onend = u.onerror = () => res(); speechSynthesis.cancel(); speechSynthesis.speak(u); setTimeout(res, 12000);
    });
  }
  /** Gemini writes the link when the server has a key; otherwise the written lines below. */
  private async djLine(prev: QueueEntry | null, nextId: string): Promise<string> {
    const n = parseTitle(this.saved.songs[nextId]?.title), s = currentShow();
    try {
      const r = await fetch('/ns/dj', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(3500),
        body: JSON.stringify({ host: personaOf(s).name, show: s.name, mood: moodLabel(this.mood),
          time: new Date().toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit', weekday: 'long', timeZone: TZ }),
          weather: this.weather.temp != null ? `${this.weather.temp} degrees, ${this.weather.condition}` : '',
          prev: prev?.title ? `${prev.title}${prev.artist ? ' by ' + prev.artist : ''}` : '', next: [n.title, n.artist].filter(Boolean).join(' by ') }) });
      if (r.status === 200) { const d = await r.json() as { text?: string }; if (d.text) return d.text; }
    } catch { /* offline or slow: fall through */ }
    return this.link(prev, nextId);
  }
  private link(prev: QueueEntry | null, nextId: string) {
    const s = currentShow(), lines = LINES[s.id] ?? [''], line = lines[Math.floor(Math.random() * lines.length)] ?? '';
    const when = new Date().toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
    const sky = this.weather.temp != null && Math.random() < 0.4 ? ` ${this.weather.temp} degrees outside.` : '';
    const n = parseTitle(this.saved.songs[nextId]?.title);
    const lead = Math.random() < 0.5 && prev?.title ? `That was ${prev.title}.` : `${when} on ${STATION_NAME}.`;
    return `${lead}${sky} ${line}${n.artist ? ` Up next, ${n.artist}.` : ''}`;
  }

  // ---------- shared clock: every listener hears the same song at the same moment ----------
  // ---------- My Station: personal, taste-driven, plays each song to its real end ----------
  private minePool(): string[] {
    const liked = Object.entries(this.saved.songs).filter(([, v]) => v.likes > 0).map(([id]) => id);
    return [...new Set([...(this.saved.mine ?? []), ...liked, ...(this.saved.mix ?? [])])].filter(id => !this.saved.banned.includes(id));
  }
  private mineNext = '';
  /** Up-next candidates from the YouTube Mix of the song on air (refreshed on every My Station song). */
  private chain: string[] = [];
  private pickMine(): string {
    const recent = new Set(this.history.slice(0, 15).map(h => h.subsonic_id).concat(this.current?.id ?? ''));
    const chained = this.chain.filter(id => !recent.has(id) && !this.saved.banned.includes(id));
    // Mostly follow the chain (fresh, similar songs); every few songs return to your own picks.
    if (chained.length && Math.random() < 0.65) return chained[Math.floor(Math.random() * Math.min(5, chained.length))]!;
    const pool = this.minePool().filter(id => !recent.has(id));
    if (!pool.length) return onAir(moodList('trending'), this.now(), 2)?.next ?? 'kJQP7kiw5Fk';
    // Your own playlists and likes weigh more than fresh Mix discoveries.
    const own = new Set([...(this.saved.mine ?? []), ...Object.keys(this.saved.songs).filter(id => (this.saved.songs[id]?.likes ?? 0) > 0)]);
    const w = (id: string) => (own.has(id) ? 3 : 1) + (this.saved.songs[id]?.likes ?? 0) * 2;
    let r = Math.random() * pool.reduce((t, id) => t + w(id), 0);
    for (const id of pool) if ((r -= w(id)) <= 0) return id;
    return pool[0]!;
  }
  private mineLeft() {
    const p = this.player as unknown as { getDuration?(): number; getCurrentTime?(): number } | null;
    const d = p?.getDuration?.() || 0, t = p?.getCurrentTime?.() || 0;
    return d > 0 ? Math.max(1500, (d - TAIL - t) * 1000) : 240000;
  }
  private slot() {
    if (this.mood === 'mine') {
      if (!this.mineNext) this.mineNext = this.pickMine();
      return { id: this.mineNext, next: this.mineNext, offset: 0, msLeft: this.mineLeft(), nextD: 0, index: 0 };
    }
    const salt = MOODS.findIndex(x => x[0] === this.mood) + 1;
    const a = onAir(moodList(this.mood), this.now(), salt);
    return a ?? { id: 'kJQP7kiw5Fk', next: 'kJQP7kiw5Fk', offset: 0, msLeft: 180000, nextD: 180, index: 0 };
  }
  private boundary: ReturnType<typeof setTimeout> | null = null;
  private preroll: ReturnType<typeof setTimeout> | null = null;
  private onRequest = false;
  private fading = false;

  // ---------- Offline · My Files: the listener's own audio files, no network, two <audio> decks ----------
  private aud: HTMLAudioElement[] = [];
  private audLive = 0;
  private tracks: LocalTrack[] = [];
  private localUrl: string[] = ['', ''];
  private localT: ReturnType<typeof setTimeout> | null = null;
  private localCur: LocalTrack | null = null;
  async reloadTracks() { this.tracks = await listTracks(); this.emit(); return this.tracks.length; }
  get trackCount() { return this.tracks.length; }
  private ensureAudio() {
    if (this.aud.length) return;
    for (let i = 0; i < 2; i++) { const a = new Audio(); a.preload = 'auto'; a.onended = () => { if (i === this.audLive && this.mood === 'local') void this.localNext(true); }; this.aud.push(a); }
  }
  private pickLocal(): LocalTrack | null {
    if (!this.tracks.length) return null;
    const recent = new Set(this.history.slice(0, Math.min(10, this.tracks.length - 1)).map(h => h.subsonic_id));
    const pool = this.tracks.filter(t => !recent.has(t.id));
    const list = pool.length ? pool : this.tracks;
    return list[Math.floor(Math.random() * list.length)]!;
  }
  private rampAudio(a: HTMLAudioElement, to: number, ms: number): Promise<void> {
    const from = a.volume, steps = Math.max(1, Math.round(ms / 60));
    return new Promise(res => { let k = 0; const t = setInterval(() => { k++; a.volume = Math.max(0, Math.min(1, (from + (to - from) * (k / steps)) * 1)); if (k >= steps) { clearInterval(t); res(); } }, 60); });
  }
  private async localNext(talk: boolean) {
    this.ensureAudio(); if (!this.tracks.length) await this.reloadTracks();
    const t = this.pickLocal();
    if (!t) { this.status = 'idle'; this.emit(); void this.say('No songs on this device yet. Add your own files under Offline, then press play.', false); return; }
    const prev = this.current, from = this.audLive, to = this.aud[from]?.src ? 1 - from : from;
    const a = this.aud[to]!;
    if (this.localUrl[to]) URL.revokeObjectURL(this.localUrl[to]!);
    this.localUrl[to] = URL.createObjectURL(t.blob); a.src = this.localUrl[to]!; a.volume = 0;
    const { title, artist } = parseTitle(t.name);
    this.saved.songs[t.id] ??= { title: t.name, likes: 0, plays: 0 };
    this.localCur = t; this.audLive = to;
    this.current = { id: t.id, subsonic_id: t.id, title, artist, startedAt: iso() };
    this.history.unshift({ title, artist, subsonic_id: t.id, startedAt: this.current.startedAt }); this.history = this.history.slice(0, 30);
    this.status = 'playing'; this.emit();
    try { await a.play(); } catch { /* autoplay blocked until a tap */ }
    const talking = talk ? this.say(this.link(prev, t.id)) : Promise.resolve();
    const old = from !== to ? this.aud[from] : undefined;
    await Promise.all([old ? this.rampAudio(old, 0, 2500) : Promise.resolve(), this.rampAudio(a, talk ? 0.4 * this.volume : this.volume, 2000)]);
    old?.pause(); await talking; await this.rampAudio(a, this.volume, 1200);
    if (this.localT) clearTimeout(this.localT);
    const armAt = () => { if (this.current?.id === t.id) { this.current = { ...this.current, duration: a.duration }; this.emit(); } const left = (a.duration - a.currentTime - TAIL) * 1000; if (Number.isFinite(left)) this.localT = setTimeout(() => { if (this.mood === 'local' && this.localCur === t) void this.localNext(true); }, Math.max(1000, left)); };
    if (Number.isFinite(a.duration)) armAt(); else a.onloadedmetadata = armAt;
  }
  private stopLocal() { if (this.localT) clearTimeout(this.localT); this.aud.forEach(a => a.pause()); this.localCur = null; }

  async tune() {
    if (this.mood === 'local') { this.init(); this.userPaused = false; const a = this.aud[this.audLive];
      if (this.status === 'paused' && a?.src) { await a.play().catch(() => {}); this.status = 'playing'; void this.rampAudio(a, this.volume, 500); this.emit(); return; }
      await this.localNext(false); return; }
    this.init(); const resume = !!this.current && this.status === 'paused'; this.status = 'connecting'; this.emit();
    const p = await this.ensurePlayer(); if (!p) return;
    this.userPaused = false;
    await this.seeding;
    // One tap and you're in: join the broadcast where it is right now, fading up. A resume after pause
    // also rejoins live (it's radio), unless a request is mid-play.
    if (resume && this.onRequest) { p.playVideo(); void this.ramp(this.live, 1, 600); return; }
    const sl = this.slot();
    this.setDeckVol(this.live, 0);
    this.load(this.live, sl.id, this.mood === 'mine' ? 0 : sl.offset + 0.4);
    void this.ramp(this.live, 1, 1500);
    this.arm();
  }
  private load(deck: number, id: string, at: number) {
    if (id === this.mineNext) this.mineNext = '';
    this.current = { id, subsonic_id: id }; this.onRequest = false; this.emit();
    (this.decks[deck] as unknown as { loadVideoById(o: { videoId: string; startSeconds: number }): void }).loadVideoById({ videoId: id, startSeconds: Math.floor(at) });
  }
  /** Schedule the next handover: cue the idle deck early, then crossfade on the slot boundary. */
  private arm() {
    if (this.boundary) clearTimeout(this.boundary);
    if (this.preroll) clearTimeout(this.preroll);
    const sl = this.slot();
    this.preroll = setTimeout(() => {
      const idle = 1 - this.live; this.setDeckVol(idle, 0);
      (this.decks[idle] as unknown as { cueVideoById(o: { videoId: string; startSeconds: number }): void }).cueVideoById({ videoId: sl.next, startSeconds: 0 });
    }, Math.max(0, sl.msLeft - 20000));
    this.boundary = setTimeout(() => void this.crossTo(this.slot().id, 0, true), sl.msLeft);
  }
  /** Crossfade from the live deck to `id` on the idle deck; the DJ talks over the blend. */
  private async crossTo(id: string, at: number, talk: boolean, line?: string) {
    if (this.status === 'idle' || this.decks.length < 2) return;
    const prev = this.current, from = this.live, to = 1 - from;
    if (prev) { const h = this.history.find(x => x.subsonic_id === prev.id); if (h) h.endedAt = iso(); }
    this.fading = true;
    this.setDeckVol(to, 0);
    this.live = to; this.load(to, id, at);
    this.showDeck(to);
    if (talk) this.applyAutoMood();
    const text = line ?? (talk ? this.takeDedication() + await Promise.race([this.djLine(prev, id), new Promise<string>(r => setTimeout(() => r(this.link(prev, id)), 1800))]) : '');
    const talking = text ? this.say(text) : Promise.resolve();
    await Promise.all([this.ramp(from, 0, talk ? 2600 : 1200), this.ramp(to, text ? 0.4 : 1, talk ? 2200 : 1200)]);
    this.decks[from]?.stopVideo(); this.fading = false;
    await talking; await this.ramp(to, 1, 1200);
    this.arm();
  }
  /** Skip / request: a request crossfades in; otherwise rejoin the broadcast where it is now. */
  async next(_talk = false) {
    if (this.mood === 'local') { await this.localNext(false); return; }
    const req = this.upcoming.find(x => x !== this.slot().next);
    if (req) { this.upcoming = this.upcoming.filter(x => x !== req); await this.crossTo(req, 0, true); this.onRequest = true; return; }
    if (this.mood === 'mine') { await this.crossTo(this.pickMine(), 0, false); return; }
    const sl = this.slot(); await this.crossTo(sl.id, sl.offset, false);
  }
  private userPaused = false;
  // Keep the screen (and with it the tab) awake while the station is on air.
  private wake: { release(): Promise<void> } | null = null;
  private keepAwake() {
    const wl = (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
    if (!wl || this.wake) return;
    wl.request('screen').then(l => { this.wake = l; }).catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && this.status === 'playing') { this.wake = null; this.keepAwake(); } }, { once: true });
  }
  // Slow network: say so on the booth log instead of leaving an awkward silence.
  private bufTimer: ReturnType<typeof setTimeout> | null = null;
  private watchBuffering() {
    if (this.bufTimer || this.fading) return;
    this.bufTimer = setTimeout(() => { void this.say("Signal's a little weak right now. Hang tight, the music's coming back.", false); }, 4000);
  }
  private clearBuffering() { if (this.bufTimer) { clearTimeout(this.bufTimer); this.bufTimer = null; } }
  // ---------- extras: dedications, sleep/alarm, auto mood, lyrics, history, wrapped ----------
  private dedication = '';
  dedicate(text: string) { this.dedication = text.trim().slice(0, 140); void this.say(`Got your dedication. It goes out with the next song.`, false); }
  private takeDedication() { const d = this.dedication; this.dedication = ''; return d ? `This next one is a dedication: ${d}. ` : ''; }

  sleepAt: number | null = null;
  private sleepT: ReturnType<typeof setTimeout> | null = null;
  sleep(min: number) {
    if (this.sleepT) clearTimeout(this.sleepT);
    this.sleepAt = min > 0 ? Date.now() + min * 60000 : null; this.emit();
    if (min > 0) this.sleepT = setTimeout(() => { void this.say('Sleep timer. Good night from nightshift radio.', true).then(() => this.stop()); this.sleepAt = null; }, min * 60000);
  }
  alarmAt: string | null = null;
  private alarmT: ReturnType<typeof setTimeout> | null = null;
  /** Wake-up at HH:MM (local time) into Morning-friendly Trending. Needs this tab left open. */
  alarm(hhmm: string | null) {
    if (this.alarmT) clearTimeout(this.alarmT);
    this.alarmAt = hhmm; this.emit();
    if (!hhmm) return;
    const [h, m] = hhmm.split(':').map(Number); const t = new Date(); t.setHours(h ?? 7, m ?? 0, 0, 0);
    if (t.getTime() <= Date.now()) t.setDate(t.getDate() + 1);
    this.alarmT = setTimeout(() => { this.alarmAt = null; this.setVolume(Math.max(this.volume, 0.6)); this.setMood('trending'); void this.tune(); }, t.getTime() - Date.now());
  }

  get autoMood() { return !!this.saved.autoMood; }
  setAutoMood(on: boolean) { this.saved.autoMood = on; this.save(); this.emit(); if (on) this.applyAutoMood(); }
  /** Rain means lo-fi, small hours mean Late Night, and so on. Checked on every handover. */
  private applyAutoMood() {
    if (!this.saved.autoMood) return;
    const h = hourNow(), wet = /rain|storm|snow/.test(this.weather.condition ?? '');
    const m = wet ? 'lofi' : h < 5 ? 'night' : h < 7 ? 'sufi' : h < 9 ? 'gym' : h < 12 ? 'trending' : h < 17 ? 'lofi' : h < 21 ? 'drive' : 'romantic';
    if (m !== this.mood) this.setMood(m);
  }
  themeId() { return MOOD_THEME[this.mood] ?? 'classic-dark'; }

  private lyricCache = new Map<string, { t: number; l: string }[] | null>();
  /** Time-synced lyrics from LRCLIB (free, no key); plain lyrics come back untimed. */
  async lyrics(id: string): Promise<{ t: number; l: string }[] | null> {
    if (this.lyricCache.has(id)) return this.lyricCache.get(id)!;
    const { title, artist } = parseTitle(this.saved.songs[id]?.title);
    if (!title) return null;
    try {
      const r = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(`${title} ${artist}`.trim())}`, { signal: AbortSignal.timeout(6000) });
      const hits = (await r.json()) as { syncedLyrics?: string; plainLyrics?: string }[];
      const hit = hits.find(x => x.syncedLyrics) ?? hits.find(x => x.plainLyrics);
      const lines = hit?.syncedLyrics
        ? hit.syncedLyrics.split('\n').map(x => { const m = x.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/); return m ? { t: Number(m[1]) * 60 + Number(m[2]), l: m[3] ?? '' } : null; }).filter((x): x is { t: number; l: string } => !!x && !!x.l)
        : hit?.plainLyrics ? hit.plainLyrics.split('\n').filter(Boolean).map(l => ({ t: -1, l })) : null;
      this.lyricCache.set(id, lines?.length ? lines : null);
    } catch { return null; }
    return this.lyricCache.get(id) ?? null;
  }
  get currentId() { return this.current?.id ?? null; }
  title(id: string) { return parseTitle(this.saved.songs[id]?.title); }

  history24() { return (this.saved.log ?? []).filter(x => Date.now() - x.at < 86400000).slice().reverse(); }
  wrapped(days = 7) {
    const log = (this.saved.log ?? []).filter(x => Date.now() - x.at < days * 86400000);
    const secs = log.reduce((t, x, i) => t + (x.s || (i === log.length - 1 ? Math.round((Date.now() - x.at) / 1000) : 150)), 0);
    const top = (f: (x: (typeof log)[number]) => string) => { const c = new Map<string, number>(); log.forEach(x => { const k = f(x); if (k) c.set(k, (c.get(k) ?? 0) + 1); });
      return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''; };
    const topId = top(x => x.id);
    return { songs: log.length, hours: Math.round((secs / 3600) * 10) / 10, minutes: Math.round(secs / 60), artist: top(x => this.title(x.id).artist), mood: moodLabel(top(x => x.mood)),
      song: topId ? this.title(topId).title : '' };
  }

  /** Song search through the server (YouTube results page, no key). */
  async search(q: string): Promise<{ id: string; title: string; channel: string; length: string }[]> {
    try { const r = await fetch(`/ns/search?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(9000) }); return ((await r.json()) as { results?: [] }).results ?? []; }
    catch { return []; }
  }
  /** Play a searched song right away: in My Station it joins your station; elsewhere it plays once, then the broadcast resumes. */
  async playNow(id: string, title = '') {
    this.saved.songs[id] ??= { title, likes: 0, plays: 0 };
    if (title && !this.saved.songs[id]!.title) this.saved.songs[id]!.title = title;
    this.saved.mine = [...new Set([id, ...(this.saved.mine ?? [])])]; this.save();
    if (this.status === 'idle' || !this.decks.length) { if (this.mood !== 'mine') this.setMood('mine'); this.mineNext = id; await this.tune(); return; }
    if (this.mood === 'mine') { await this.crossTo(id, 0, false, `Here's ${parseTitle(title).title || 'your pick'}.`); return; }
    this.upcoming.unshift(id); await this.next();
  }

  play() { void this.tune(); }
  pause() { if (this.mood === 'local') { this.userPaused = true; this.status = 'paused'; this.emit(); const a = this.aud[this.audLive]; if (a) void this.rampAudio(a, 0, 300).then(() => a.pause()); return; }
    this.userPaused = true; this.status = 'paused'; this.emit(); const i = this.live; void this.ramp(i, 0, 350).then(() => { if (this.userPaused) this.decks[i]?.pauseVideo(); }); }
  stop() {
    this.stopLocal();
    this.userPaused = true;
    this.decks.forEach(d => d.stopVideo());
    if (this.boundary) clearTimeout(this.boundary);
    if (this.preroll) clearTimeout(this.preroll);
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    this.wake?.release().catch(() => {}); this.wake = null; this.clearBuffering();
    this.status = 'idle'; this.current = null; this.emit();
  }
  setVolume(v: number) { this.volume = Math.max(0, Math.min(1, v)); const la = this.aud[this.audLive]; if (this.localCur && la) la.volume = this.volume; this.decks.forEach((_, i) => this.setDeckVol(i, this.deckVol[i] ?? 1)); this.save(); this.emit(); }
  elapsed() { if (this.localCur) return this.aud[this.audLive]?.currentTime ?? 0; const p = this.player; return p && typeof p.getCurrentTime === 'function' ? p.getCurrentTime() || 0 : 0; }

  like(songId: string) {
    const s = this.saved.songs[songId]; if (!s) return { ok: false, error: 'no track' };
    s.likes++; this.save();
    this.harvest('RD' + songId).then(ids => {
      const fresh = ids.filter(x => x !== songId && !this.saved.banned.includes(x)).slice(0, 25);
      this.saved.mix = [...new Set([...fresh, ...(this.saved.mix ?? [])])].slice(0, 500); this.save();
    });
    return { ok: true, songId, liked: true, count: s.likes };
  }
  likeStatus() { const id = this.current?.id; return { enabled: true, songId: id ?? null, liked: !!(id && this.saved.songs[id]?.likes), count: id ? this.saved.songs[id]?.likes ?? 0 : 0 }; }

  request(text: string): RequestResult {
    const requestId = 'r' + Date.now();
    const id = text.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/)?.[1], list = text.match(/list=([\w-]+)/)?.[1];
    let res: RequestResult;
    if (id) {
      this.saved.songs[id] ??= { title: '', likes: 1, plays: 0 }; this.upcoming.unshift(id);
      this.saved.mine = [...new Set([...(this.saved.mine ?? []), id])]; this.save();
      res = { success: true, status: 'resolved', requestId, requestText: text, ack: 'Got it. That one is up next.', queuePosition: 1, track: { subsonic_id: id, title: 'Your request' } };
    } else if (list) {
      void this.harvest(list).then(ids => { ids.forEach(x => (this.saved.songs[x] ??= { title: '', likes: 0, plays: 0 }));
        this.saved.mine = [...new Set([...(this.saved.mine ?? []), ...ids])]; this.save(); this.emit(); });
      res = { success: true, status: 'resolved', requestId, requestText: text, ack: 'Playlist added to My Station.' };
    } else res = { success: false, status: 'failed', requestId, requestText: text, message: 'Paste a YouTube song or playlist link.' };
    this.requests.set(requestId, res);
    return res;
  }
  requestStatus(id: string) { return this.requests.get(id) ?? { success: false, status: 'unknown' as const }; }

  // Read a playlist / YouTube Mix through a hidden helper player (no API key needed).
  private async harvest(list: string): Promise<string[]> {
    const YT = this.yt || (await loadYT());
    return new Promise(res => {
      const box = document.createElement('div'); box.style.cssText = 'position:absolute;left:-9999px;width:200px;height:200px';
      document.body.appendChild(box);
      const h = new YT.Player(box, { playerVars: { listType: 'playlist', list }, events: { onReady: () => {
        let n = 0; const t = setInterval(() => { const ids = h.getPlaylist() || [];
          if (ids.length || ++n > 12) { clearInterval(t); res(ids); h.destroy(); box.remove(); } }, 500);
      } } });
    });
  }
  private async seed() { Object.keys(LIB.songs).forEach(id => (this.saved.songs[id] ??= { title: '', likes: 0, plays: 0 })); this.save(); }



  // ---------- controller-shaped payloads ----------
  nowPlaying(): NowPlayingResponse {
    const s = currentShow(), p = personaOf(s), c = this.current;
    const live = this.status === 'playing' || this.status === 'paused';
    return {
      nowPlaying: c && live ? { title: c.title || 'Tuning…', artist: c.artist || '', album: STATION_NAME, duration: c.duration, subsonic_id: c.id,
        genre: moodLabel(this.mood), moods: s.moods, energy: s.energy, bpm: null } : null,
      context: { time: { show: s.name, vibe: s.topic }, weather: this.weather, dominantMood: s.mood, activeShow: { name: s.name, persona: { id: p.id, name: p.name, avatar: '' }, guests: [] } },
      dj: { station: STATION_NAME, stationDescription: 'your late-night companion, a DJ who never clocks out.', tagline: p.tagline, name: p.name },
      activeShow: { name: s.name, persona: { id: p.id, name: p.name, avatar: '' }, guests: [] },
      listeners: { current: live ? 1 : 0, peak: 1 },
      streamOnline: true,
      stream: { format: 'youtube', bufferSeconds: 0, opusEnabled: false },
      llmTokens: null, timezone: TZ, locale: 'en-GB',
    };
  }
  state(): StationState & { current?: { title?: string; startedAt?: string } } {
    const up = this.upcoming.map(id => { const t = parseTitle(this.saved.songs[id]?.title); return { title: t.title || 'Fresh pick', artist: t.artist, subsonic_id: id, queuedAt: iso() }; });
    return { upcoming: up, history: this.history.slice(1), timezone: TZ, locale: 'en-GB', ui: { skin: 'axo', tuneInOverlay: false, boothBuddy: false },
      current: this.current?.startedAt ? { title: this.current.title, startedAt: this.current.startedAt } : undefined };
  }
  session(): SessionPayload { return { session: { id: 'local' }, messages: this.messages }; }
  schedule(): SchedulePayload {
    const grid: Record<number, Array<string | null>> = {};
    for (let d = 0; d < 7; d++) grid[d] = Array.from({ length: 24 }, (_, h) => showAt(h).id);
    return { personas: PERSONAS, shows: SHOWS.map(({ from: _f, energy: _e, ...s }) => s), schedule: grid, timezone: TZ, locale: 'en-GB' };
  }
}

export const station = new LocalStation();
