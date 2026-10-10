import type { Platform } from './platform';

const DATABASE = 'stillwake';
const SAVES = 'saves';

/** The development platform: saves live in the browser's IndexedDB. */
export function browserPlatform(): Platform {
  let database: Promise<IDBDatabase> | undefined;
  const store = async (mode: IDBTransactionMode) => {
    database ??= open();
    return (await database).transaction(SAVES, mode).objectStore(SAVES);
  };

  return {
    saves: {
      async read(slot) {
        const value: unknown = await done((await store('readonly')).get(slot));
        return typeof value === 'string' ? value : undefined;
      },
      async write(slot, text) {
        const saves = await store('readwrite');
        saves.put(text, slot);
        // A save counts as written once its transaction commits, not when the put is queued.
        await committed(saves.transaction);
      },
    },
  };
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(SAVES);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(`Cannot open ${DATABASE}.`));
  });
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function committed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB write failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB write aborted.'));
  });
}
