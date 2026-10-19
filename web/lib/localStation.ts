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

// Punjabi hit playlists seed the library; YouTube Mix of liked songs keeps adding fresh ones.
const PLAYLISTS = ['PLNCA1T91UH31M7mN8iKSxMwwWB_mkzwT6', 'PL6_AX-gRSOpuWInKGtQUJuF7QWabStH9j', 'PLO7-VO1D0_6NYoMAN0XncJu4tvibirSmN',
  'PLhGslrRCBNB_3kz5lgkOTWwxPiio-CXk_', 'PLkCEdVkZvreMnWmY3GhgmKhPD3pnbp6Tv', 'PL-QvSRz8uhNHYPsQFUyZ4vEDURCBqLiR1', 'PLHvybnsTYyfX336Tn6Pych7U_uDuMNZIL'];

// ---------- shows & hosts (hour-of-day schedule) ----------
const PERSONAS = [
  { id: 'meher', name: 'Meher', tagline: 'morning chai, soft starts', avatar: '' },
  { id: 'heer', name: 'Heer', tagline: 'focus, calm, flow', avatar: '' },
  { id: 'kabir', name: 'Kabir', tagline: 'windows down, volume up', avatar: '' },
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
interface Saved { songs: Record<string, Song>; banned: string[]; seeded?: boolean; volume?: number }
const KEY = 'nightshift-radio';
const load = (): Saved => { try { return { songs: {}, banned: [], ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { songs: {}, banned: [] }; } };

// ---------- helpers ----------
export function parseTitle(t = '') {
  const clean = t.replace(/\s*[([].*?(official|video|audio|lyric|4k|hd|full song|latest|new punjabi).*?[)\]]/gi, '').replace(/\s*\|.*$/, '').trim();
  const parts = clean.split(/\s[-–]\s/);
  return parts.length > 1 ? { artist: (parts[0] ?? '').trim(), title: parts.slice(1).join(' - ').trim() } : { artist: '', title: clean };
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
  private player: YTPlayer | null = null;
  private yt: YTNs | null = null;
  private subs = new Set<() => void>();
  private mix: string[] = [];
  status: EngineStatus = 'idle';
  volume = 0.8;
  current: (QueueEntry & { id: string; duration?: number }) | null = null;
  upcoming: string[] = [];
  history: QueueEntry[] = [];
  messages: SessionTurn[] = [];
  private requests = new Map<string, RequestResult>();
  private weather: { condition?: string; temp?: number; location?: string } = {};
  private started = false;

  init() {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    this.saved = load();
    this.volume = this.saved.volume ?? 0.8;
    this.fetchWeather();
    this.say(`Station's warm. ${STATION_NAME}, ${currentShow().name} with ${personaOf().name}. Press play whenever you're ready.`, false);
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

  // The visible TV element is created by PlayerShell; the player mounts into it.
  private async ensurePlayer(): Promise<YTPlayer | null> {
    if (this.player) return this.player;
    const host = document.getElementById('ns-tv-screen');
    if (!host) return null;
    this.yt = await loadYT();
    const mount = document.createElement('div'); host.appendChild(mount);
    await new Promise<void>(res => {
      this.player = new this.yt!.Player(mount, {
        width: '100%', height: '100%', playerVars: { controls: 0, rel: 0, playsinline: 1, disablekb: 1 },
        events: {
          onReady: () => res(),
          onStateChange: (e: { data: number }) => this.onState(e.data),
          onError: () => { if (this.current) this.saved.banned.push(this.current.id); this.save(); void this.next(false); },
        },
      });
    });
    this.player!.setVolume(Math.round(this.volume * 100));
    void this.seed();
    return this.player;
  }

  private onState(s: number) {
    const S = this.yt!.PlayerState;
    if (s === S.PLAYING) { this.status = 'playing'; this.onPlaying(); }
    else if (s === S.PAUSED && this.status === 'playing') this.status = 'paused';
    else if (s === S.ENDED) { void this.next(true); return; }
    this.emit();
  }

  private onPlaying() {
    const p = this.player!, d = p.getVideoData(), id = this.current?.id;
    if (!id) return;
    const song = (this.saved.songs[id] ??= { title: '', likes: 0, plays: 0 });
    if (d.title && song.title !== d.title) { song.title = d.title; this.save(); }
    const { title, artist } = parseTitle(song.title);
    if (!this.current!.startedAt) {
      this.current = { ...this.current!, title, artist, startedAt: iso(), duration: p.getDuration() || undefined };
      song.plays++; this.save();
      if (this.history[0]?.subsonic_id !== id) this.history.unshift({ title, artist, subsonic_id: id, startedAt: this.current.startedAt });
      this.history = this.history.slice(0, 30);
      this.cue();
    } else if (!this.current!.title) this.current = { ...this.current!, title, artist };
  }

  private pick(): string {
    if (this.mix.length && Math.random() < 0.35) return this.mix.shift()!;
    const recent = new Set(this.history.slice(0, 8).map(h => h.subsonic_id));
    const pool = Object.entries(this.saved.songs).filter(([id]) => !this.saved.banned.includes(id) && !recent.has(id) && id !== this.current?.id);
    let r = Math.random() * pool.reduce((t, [, s]) => t + 1 + s.likes * 3, 0);
    for (const [id, s] of pool) if ((r -= 1 + s.likes * 3) <= 0) return id;
    return pool[0]?.[0] || 'kJQP7kiw5Fk';
  }
  private cue() { if (!this.upcoming.length) this.upcoming.push(this.pick()); void this.fillTitle(this.upcoming[0]); }
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
      const u = new SpeechSynthesisUtterance(text); u.rate = 1; u.pitch = 0.9; u.volume = this.volume;
      u.onend = u.onerror = () => res(); speechSynthesis.cancel(); speechSynthesis.speak(u); setTimeout(res, 14000);
    });
  }
  private link(prev: QueueEntry | null, nextId: string) {
    const s = currentShow(), lines = LINES[s.id] ?? [''], line = lines[Math.floor(Math.random() * lines.length)] ?? '';
    const when = new Date().toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit', weekday: 'long', timeZone: TZ });
    const sky = this.weather.temp != null ? `, ${this.weather.temp} degrees and ${this.weather.condition}` : '';
    const n = parseTitle(this.saved.songs[nextId]?.title);
    return `${when}${sky}. ${prev?.title ? `That was ${prev.title}. ` : ''}${line}${n.artist ? ` Here's ${n.artist}.` : ''}`;
  }

  async tune() {
    this.init(); const resume = !!this.current && this.status === 'paused'; this.status = 'connecting'; this.emit();
    const p = await this.ensurePlayer(); if (!p) return;
    if (resume) { p.playVideo(); return; }
    await this.say(`You're listening to ${STATION_NAME}. ${currentShow().name} with ${personaOf().name}.`);
    await this.next(false, true);
  }
  async next(talk: boolean, join = false) {
    const p = this.player; if (!p) return;
    const prev = this.current; if (prev) { const h = this.history.find(x => x.subsonic_id === prev.id); if (h) h.endedAt = iso(); }
    const id = this.upcoming.shift() || this.pick();
    if (talk) { p.pauseVideo(); await this.say(this.link(prev, id)); }
    this.current = { id, subsonic_id: id }; this.emit();
    p.loadVideoById(id);
    if (join) setTimeout(() => { const d = p.getDuration(); if (d > 90) (p as unknown as { seekTo(s: number, a: boolean): void }).seekTo(Math.floor(d * (0.15 + Math.random() * 0.4)), true); }, 2500);
  }
  play() { this.player?.playVideo(); }
  pause() { this.player?.pauseVideo(); this.status = 'paused'; this.emit(); }
  stop() { this.player?.stopVideo(); speechSynthesis?.cancel(); this.status = 'idle'; this.emit(); }
  setVolume(v: number) { this.volume = Math.max(0, Math.min(1, v)); this.player?.setVolume(Math.round(this.volume * 100)); this.save(); this.emit(); }
  elapsed() { return this.player?.getCurrentTime() || 0; }

  like(songId: string) {
    const s = this.saved.songs[songId]; if (!s) return { ok: false, error: 'no track' };
    s.likes++; this.save();
    this.harvest('RD' + songId).then(ids => { this.mix = ids.filter(x => x !== songId && !this.saved.banned.includes(x)).slice(0, 15); });
    return { ok: true, songId, liked: true, count: s.likes };
  }
  likeStatus() { const id = this.current?.id; return { enabled: true, songId: id ?? null, liked: !!(id && this.saved.songs[id]?.likes), count: id ? this.saved.songs[id]?.likes ?? 0 : 0 }; }

  request(text: string): RequestResult {
    const requestId = 'r' + Date.now();
    const id = text.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/)?.[1], list = text.match(/list=([\w-]+)/)?.[1];
    let res: RequestResult;
    if (id) {
      this.saved.songs[id] ??= { title: '', likes: 1, plays: 0 }; this.upcoming.unshift(id); this.save();
      res = { success: true, status: 'resolved', requestId, requestText: text, ack: 'Got it. That one is up next.', queuePosition: 1, track: { subsonic_id: id, title: 'Your request' } };
    } else if (list) {
      void this.harvest(list).then(ids => { ids.forEach(x => (this.saved.songs[x] ??= { title: '', likes: 1, plays: 0 })); this.save(); });
      res = { success: true, status: 'resolved', requestId, requestText: text, ack: 'Playlist added to the library.' };
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
  private async seed() {
    if (this.saved.seeded && Object.keys(this.saved.songs).length > 50) return;
    for (const pl of PLAYLISTS) (await this.harvest(pl)).forEach(id => (this.saved.songs[id] ??= { title: '', likes: 0, plays: 0 }));
    this.saved.seeded = true; this.save(); this.emit();
  }

  // ---------- controller-shaped payloads ----------
  nowPlaying(): NowPlayingResponse {
    const s = currentShow(), p = personaOf(s), c = this.current;
    const live = this.status === 'playing' || this.status === 'paused';
    return {
      nowPlaying: c && live ? { title: c.title || 'Tuning…', artist: c.artist || '', album: STATION_NAME, duration: c.duration, subsonic_id: c.id,
        genre: 'Punjabi', moods: s.moods, energy: s.energy, bpm: null } : null,
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
