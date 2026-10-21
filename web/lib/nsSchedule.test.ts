import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EPOCH, onAir, type Song } from './nsSchedule';

const songs: Song[] = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, d: 150 + i * 13 }));
const at = EPOCH + 5 * 3600_000 + 123_456;

// Refresh in a radio mood shifts this listener's clock by (time left in the song + 50 ms).
test('refresh hop lands at the start of the following song of the loop', () => {
  const now = onAir(songs, at, 3)!;
  const after = onAir(songs, at + now.msLeft + 50, 3)!;
  assert.equal(after.id, now.next);
  assert.ok(after.offset < 1, `expected to start at the beginning, got ${after.offset}s`);
  assert.notEqual(after.id, now.id);
});

test('repeated refreshes keep moving forward through different songs', () => {
  let shift = 0;
  const seen = new Set<string>();
  for (let i = 0; i < 6; i++) {
    const cur = onAir(songs, at + shift, 3)!;
    seen.add(cur.id);
    shift += cur.msLeft + 50;
  }
  assert.equal(seen.size, 6);
});

test('without a shift two listeners still hear the same song', () => {
  assert.deepEqual(onAir(songs, at, 3), onAir(songs, at, 3));
});
