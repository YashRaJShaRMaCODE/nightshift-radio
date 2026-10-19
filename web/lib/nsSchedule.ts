// nightshift radio: the shared broadcast clock. Pure functions so every listener
// computes the same "what's on air now" from the same song list and the same time.
//
// Each mood is its own station. A station's songs are shuffled per cycle (one
// pass through the whole list), laid end to end at their real durations, and
// the current position is (now - EPOCH) wrapped onto that loop.

export interface Song { id: string; d: number }
export interface OnAir { id: string; offset: number; msLeft: number; next: string; nextD: number; index: number }

export const EPOCH = Date.UTC(2026, 0, 1);
/** Seconds trimmed off every song's tail so the crossfade lands on music, not on the fade-to-black. */
export const TAIL = 6;

function shuffled(songs: Song[], seed: number): Song[] {
  const out = [...songs];
  let s = (Math.imul(seed ^ 0x9e3779b9, 2654435761) >>> 0) % 2147483646 + 1;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j]!, out[i]!]; }
  return out;
}

const slotLen = (s: Song) => Math.max(30, s.d - TAIL) * 1000;

/** Which song is on air for `songs` at time `at` (ms), and how far into it. */
export function onAir(songs: Song[], at: number, salt = 0): OnAir | null {
  if (!songs.length) return null;
  const cycleMs = songs.reduce((t, s) => t + slotLen(s), 0);
  const since = Math.max(0, at - EPOCH);
  const cycle = Math.floor(since / cycleMs);
  let pos = since - cycle * cycleMs;
  const list = shuffled(songs, cycle * 7919 + salt);
  for (let i = 0; i < list.length; i++) {
    const len = slotLen(list[i]!);
    if (pos < len) {
      const nxt = i + 1 < list.length ? list[i + 1]! : shuffled(songs, (cycle + 1) * 7919 + salt)[0]!;
      return { id: list[i]!.id, offset: pos / 1000, msLeft: len - pos, next: nxt.id, nextD: nxt.d, index: i };
    }
    pos -= len;
  }
  return null;
}
