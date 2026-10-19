'use client';

// nightshift radio: pick a mood station. Each mood is its own synced broadcast,
// so switching crossfades straight into wherever that station is right now.

import { useEffect, useState } from 'react';
import { MOODS, station } from '@/lib/localStation';

export default function MoodPicker() {
  const [mood, setMood] = useState(station.mood);
  useEffect(() => { station.init(); setMood(station.mood); return station.subscribe(() => setMood(station.mood)); }, []);
  return (
    <label className="mb-1.5 flex items-center gap-2 font-mono text-[10px] tracking-[2px] text-muted uppercase">
      Mood
      <select
        aria-label="Mood station"
        value={mood}
        onChange={e => station.setMood(e.target.value)}
        className="min-w-0 flex-1 cursor-pointer rounded-md border border-line bg-bg px-1.5 py-1 text-[11px] tracking-[1px] text-ink"
      >
        {MOODS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
    </label>
  );
}
