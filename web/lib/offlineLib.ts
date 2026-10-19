'use client';

// nightshift radio offline library: the listener's own audio files, kept in
// IndexedDB on this device so the station can play with no network at all.

export interface LocalTrack { id: string; name: string; blob: Blob }

const DB = 'nightshift-offline', STORE = 'tracks';

function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(d => new Promise<T>((res, rej) => {
    const req = run(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  }));
}

export async function addFiles(files: FileList | File[]): Promise<number> {
  let n = 0;
  for (const f of Array.from(files)) {
    if (!f.type.startsWith('audio/') && !/\.(mp3|m4a|aac|ogg|opus|wav|flac)$/i.test(f.name)) continue;
    await tx('readwrite', s => s.put({ id: `${f.name}:${f.size}`, name: f.name.replace(/\.[^.]+$/, ''), blob: f }));
    n++;
  }
  return n;
}
export const listTracks = (): Promise<LocalTrack[]> => tx('readonly', s => s.getAll() as IDBRequest<LocalTrack[]>).catch(() => []);
export const clearTracks = (): Promise<undefined> => tx('readwrite', s => s.clear() as IDBRequest<undefined>);
