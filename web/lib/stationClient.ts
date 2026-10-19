'use client';

// Build controller URLs from StationOrigin. Preserve endpoint-specific error handling: feed JSON,
// throwing schedule/themes reads, unknown request 404s, and best-effort beacons.

import { useMemo } from 'react';
import {
  DEFAULT_STATION_ORIGIN,
  useStationOrigin,
  type StationOrigin,
} from '@/lib/stationOrigin';
import type { Theme } from '@/lib/theme';
import { station, THEMES } from '@/lib/localStation';
import type {
  NowPlayingResponse,
  RequestResult,
  SchedulePayload,
  SessionPayload,
  StationState,
} from '@/lib/types';

export interface ThemesPayload {
  /** The effective theme — what a client should actually paint. */
  active: string;
  /** Which level decided `active`. Absent on an older controller. */
  activeSource?: 'show' | 'station';
  /** settings.theme.active, i.e. what admin's station picker sets. */
  stationDefault?: string;
  /** Set only when an on-air show's themeId outranked the station default. */
  activeShow?: { id: string; name: string; themeId: string } | null;
  themes: Theme[];
}

export interface BeaconPayload {
  referrer: string;
  path: string;
  utmSource?: string;
}

/** Error statuses (403 disabled, 409 stale/no track, 429 throttled) still
 *  carry a JSON body with `error`. */
export interface LikeResult {
  ok?: boolean;
  songId?: string | null;
  liked?: boolean;
  alreadyLiked?: boolean;
  count?: number;
  error?: string;
}

/** Liked-state for the current airing, per listener via a server-side dedup
 *  key — no account needed. */
export interface LikeStatus {
  enabled: boolean;
  songId?: string | null;
  liked?: boolean;
  count?: number;
}

export interface StationClient {
  origin: StationOrigin;
  /** Prefix a controller-relative path with the station's API base.
   *  Empty/nullish input stays '' so `<img>` fallbacks keep working. */
  resolve(path: string | null | undefined): string;
  coverUrl(subsonicId: string): string;
  nowPlaying(init?: { signal?: AbortSignal }): Promise<NowPlayingResponse>;
  state(init?: { signal?: AbortSignal }): Promise<StationState>;
  session(init?: { signal?: AbortSignal }): Promise<SessionPayload>;
  /** The caller owns timeout/abort. */
  health(init?: { signal?: AbortSignal }): Promise<Response>;
  schedule(): Promise<SchedulePayload>;
  themes(): Promise<ThemesPayload>;
  submitRequest(text: string, name: string): Promise<RequestResult>;
  /** 404 → status 'unknown'; network error → null so drawers keep polling. */
  requestStatus(requestId: string): Promise<RequestResult | null>;
  /** `songId` is what the client believes is on air; the controller rejects a
   *  stale tap. null on network error. */
  likeCurrent(songId: string): Promise<LikeResult | null>;
  /** null on network error. */
  likeStatus(): Promise<LikeStatus | null>;
  /** Best-effort: never throws, never blocks. */
  beacon(payload: BeaconPayload): void;
  /** null on any failure; callers treat that as "configured" and stay put. */
  onboardingStatus(): Promise<{ needsSetup?: boolean } | null>;
}

export function createStationClient(origin: StationOrigin): StationClient {
  // nightshift radio: everything is answered by the in-browser station (lib/localStation).
  station.init();
  const ok = <T>(v: T) => Promise.resolve(v);
  return {
    origin,
    resolve: path => path || '',
    coverUrl: id => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`,
    nowPlaying: () => ok(station.nowPlaying()),
    state: () => ok(station.state()),
    session: () => ok(station.session()),
    health: () => ok(new Response('ok', { status: 200 })),
    schedule: () => ok(station.schedule()),
    themes: () => ok({ active: station.themeId(), activeSource: 'show' as const, stationDefault: 'classic-dark', activeShow: null, themes: THEMES }),
    submitRequest: text => ok(station.request(text)),
    requestStatus: id => ok(station.requestStatus(id)),
    likeCurrent: id => ok(station.like(id)),
    likeStatus: () => ok(station.likeStatus()),
    beacon: () => {},
    onboardingStatus: () => ok({ needsSetup: false }),
  };
}

/** The install this page is served from: same-origin `/api`, or the
 *  NEXT_PUBLIC_* dev overrides. Install-level concerns (theme registry,
 *  onboarding status) go through this even inside a showcase pointed at a
 *  remote station — they're about *this* deployment, not the tuned one. */
export const defaultStationClient: StationClient =
  createStationClient(DEFAULT_STATION_ORIGIN);

/** Whatever station the surrounding StationOriginProvider points at, or the
 *  default origin when there's no provider. Memoized on the origin's URL
 *  strings, which stay stable even when the origin object identity doesn't. */
export function useStationClient(): StationClient {
  const {
    apiUrl,
    streams: { mp3, opus },
  } = useStationOrigin();
  return useMemo(
    () => createStationClient({ apiUrl, streams: { mp3, opus } }),
    [apiUrl, mp3, opus],
  );
}
