'use client';

// nightshift radio: the listener's playback hook, driving the in-browser
// station (lib/localStation) and its YouTube TV instead of an Icecast <audio>.
// The Player interface is unchanged so every skin keeps working.

import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { station } from '@/lib/localStation';

export type PlayerStatus = 'idle' | 'connecting' | 'playing';

export interface Player {
  audioRef: RefObject<HTMLAudioElement | null>;
  attachAudio: (el: HTMLAudioElement | null) => void;
  tunedIn: boolean;
  playbackState: MediaSessionPlaybackState;
  status: PlayerStatus;
  volume: number;
  setVolume: Dispatch<SetStateAction<number>>;
  tune: () => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  toggleMute: () => void;
  muted: boolean;
  idleStopped: boolean;
}

export interface UsePlayerOptions {
  initialVolume?: number;
  opusEnabled?: boolean | null;
}

export function usePlayer(_opts: UsePlayerOptions = {}): Player {
  // No audio element: skins' analysers see null and fall back to their simulated visualiser.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [, force] = useState(0);
  const lastVol = useRef(0.8);
  useEffect(() => { station.init(); return station.subscribe(() => force(n => n + 1)); }, []);

  const s = station.status;
  const status: PlayerStatus = s === 'playing' ? 'playing' : s === 'connecting' ? 'connecting' : 'idle';
  const setVolume: Dispatch<SetStateAction<number>> = useCallback(v => {
    station.setVolume(typeof v === 'function' ? v(station.volume) : v);
  }, []);
  const toggleMute = useCallback(() => {
    if (station.volume > 0) { lastVol.current = station.volume; station.setVolume(0); } else station.setVolume(lastVol.current || 0.8);
  }, []);

  return {
    audioRef,
    attachAudio: () => {},
    tunedIn: s !== 'idle',
    playbackState: s === 'playing' ? 'playing' : s === 'paused' ? 'paused' : 'none',
    status,
    volume: station.volume,
    setVolume,
    tune: () => void station.tune(),
    play: () => station.play(),
    pause: () => station.pause(),
    stop: () => station.stop(),
    toggleMute,
    muted: station.volume === 0,
    idleStopped: false,
  };
}
