import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EPOCH, TAIL, onAir, type Song } from '../lib/nsSchedule';

const songs: Song[] = Array.from({ length: 50 }, (_, i) => ({ id: `s${i}`, d: 150 + (i % 7) * 20 }));

test('every listener computes the same song and offset for the same moment', () => {
  const t = EPOCH + 123_456_789;
  assert.deepEqual(onAir(songs, t), onAir([...songs], t));
});

test('offset advances in real time inside a slot and hands over at the boundary', () => {
  const t = EPOCH + 10_000_000;
  const a = onAir(songs, t)!;
  const b = onAir(songs, t + 1000)!;
  if (a.msLeft > 1000) { assert.equal(b.id, a.id); assert.ok(Math.abs(b.offset - a.offset - 1) < 1e-6); }
  const after = onAir(songs, t + a.msLeft + 1)!;
  assert.equal(after.id, a.next);
  assert.ok(after.offset < 0.01);
});

test('songs play their real length minus the crossfade tail', () => {
  const t = EPOCH + 55_555_555;
  const a = onAir(songs, t)!;
  const d = songs.find(s => s.id === a.id)!.d;
  assert.ok(Math.abs(a.offset + a.msLeft / 1000 - (d - TAIL)) < 1e-6);
});

test('each mood station gets its own order', () => {
  const t = EPOCH + 9_999_999;
  assert.notDeepEqual(onAir(songs, t, 1)?.id, onAir(songs, t, 2)?.id);
});

test('empty station is off air', () => {
  assert.equal(onAir([], Date.now()), null);
});
