import { RecapScript, ActiveSession } from "../types";

const DB_NAME = "manga_recap_db";
const STORE_NAME = "scripts";
const SESSION_STORE = "sessions";
const DB_VERSION = 2;

// Memory and LocalStorage fallback keys
const LS_SCRIPTS_KEY = "mangaroot_fallback_scripts_v1";
const LS_SESSION_KEY = "mangaroot_fallback_session_v1";

// In-memory runtime cache for seamless operation even in strict sandboxes
let inMemoryScripts: RecapScript[] = [];
let inMemorySession: ActiveSession | null = null;
let isIndexedDBAvailable: boolean | null = null;

// Helper: Safely access localStorage
function safeGetLocalStorage(key: string): string | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch (e) {
    // LocalStorage blocked (e.g., sandboxed iframe)
  }
  return null;
}

function safeSetLocalStorage(key: string, value: string): boolean {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(key, value);
      return true;
    }
  } catch (e) {
    // Quota exceeded or restricted
  }
  return false;
}

function safeRemoveLocalStorage(key: string): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch (e) {
    // Ignored
  }
}

// Initialize memory cache from localStorage if available
try {
  const cached = safeGetLocalStorage(LS_SCRIPTS_KEY);
  if (cached) {
    inMemoryScripts = JSON.parse(cached);
  }
  const cachedSession = safeGetLocalStorage(LS_SESSION_KEY);
  if (cachedSession) {
    inMemorySession = JSON.parse(cachedSession);
  }
} catch (e) {
  // Parsing fallback
}

/**
 * Attempts to open IndexedDB. Returns null if IndexedDB is not supported,
 * restricted by sandbox, or fails to initialize.
 */
export function openDatabase(): Promise<IDBDatabase | null> {
  // If already known to be unavailable, return null immediately
  if (isIndexedDBAvailable === false) {
    return Promise.resolve(null);
  }

  if (typeof window === "undefined" || !("indexedDB" in window)) {
    isIndexedDBAvailable = false;
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        // Mark as unavailable and fallback smoothly
        isIndexedDBAvailable = false;
        resolve(null);
      };

      request.onsuccess = (event) => {
        isIndexedDBAvailable = true;
        resolve((event.target as IDBOpenDBRequest).result);
      };

      request.onupgradeneeded = (event) => {
        try {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains(SESSION_STORE)) {
            db.createObjectStore(SESSION_STORE, { keyPath: "id" });
          }
        } catch (e) {
          isIndexedDBAvailable = false;
          resolve(null);
        }
      };

      request.onblocked = () => {
        // Fallback gracefully on blocked
        isIndexedDBAvailable = false;
        resolve(null);
      };
    } catch (err) {
      isIndexedDBAvailable = false;
      resolve(null);
    }
  });
}

export async function saveRecapScript(script: RecapScript): Promise<void> {
  // 1. Update in-memory and localStorage cache first (guaranteed immediate safety)
  const existingIdx = inMemoryScripts.findIndex(s => s.id === script.id);
  if (existingIdx >= 0) {
    inMemoryScripts[existingIdx] = script;
  } else {
    inMemoryScripts.unshift(script);
  }

  // Persist to localStorage without bloated image base64 if quota is an issue
  try {
    const compactScripts = inMemoryScripts.slice(0, 50).map(s => ({
      ...s,
      images: (s.images || []).map(img => ({
        name: img.name,
        mimeType: img.mimeType,
        globalIndex: img.globalIndex,
        // Only keep small image references in localStorage fallback
        base64: img.base64 && img.base64.length < 50000 ? img.base64 : ""
      }))
    }));
    safeSetLocalStorage(LS_SCRIPTS_KEY, JSON.stringify(compactScripts));
  } catch (e) {
    // Ignore localStorage write failure, in-memory cache holds it
  }

  // 2. Persist to IndexedDB if available
  try {
    const db = await openDatabase();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(script);

        request.onsuccess = () => resolve();
        request.onerror = () => resolve(); // Graceful: already cached in memory
      } catch (e) {
        resolve();
      }
    });
  } catch (e) {
    // Graceful fallback
  }
}

export async function getAllRecapScripts(): Promise<RecapScript[]> {
  try {
    const db = await openDatabase();
    if (db) {
      const dbResult = await new Promise<RecapScript[] | null>((resolve) => {
        try {
          const transaction = db.transaction([STORE_NAME], "readonly");
          const store = transaction.objectStore(STORE_NAME);
          const request = store.getAll();

          request.onsuccess = () => {
            const results = (request.result as RecapScript[]) || [];
            results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            resolve(results);
          };

          request.onerror = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      });

      if (dbResult && dbResult.length > 0) {
        inMemoryScripts = dbResult;
        return dbResult;
      }
    }
  } catch (e) {
    // Fall back to memory
  }

  // Return in-memory list (sorted newest first)
  return [...inMemoryScripts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function deleteRecapScript(id: string): Promise<void> {
  // Remove from memory
  inMemoryScripts = inMemoryScripts.filter(s => s.id !== id);
  try {
    safeSetLocalStorage(LS_SCRIPTS_KEY, JSON.stringify(inMemoryScripts));
  } catch (e) {
    // Ignored
  }

  try {
    const db = await openDatabase();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  } catch (e) {
    // Graceful
  }
}

export async function saveActiveSession(session: ActiveSession): Promise<void> {
  // Update in-memory session immediately
  inMemorySession = session;

  // Attempt lightweight localStorage backup (metadata)
  try {
    const lightSession = {
      ...session,
      // Do not store massive base64 in localStorage to avoid QuotaExceededError
      images: session.images.map(img => ({
        id: img.id,
        name: img.name,
        mimeType: img.mimeType,
        globalIndex: img.globalIndex,
        base64: img.base64 && img.base64.length < 50000 ? img.base64 : ""
      }))
    };
    safeSetLocalStorage(LS_SESSION_KEY, JSON.stringify(lightSession));
  } catch (e) {
    // Ignored
  }

  // Attempt IndexedDB full storage (supports large blobs/base64)
  try {
    const db = await openDatabase();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction([SESSION_STORE], "readwrite");
        const store = transaction.objectStore(SESSION_STORE);
        const request = store.put(session);

        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  } catch (e) {
    // Graceful
  }
}

export async function getActiveSession(): Promise<ActiveSession | null> {
  try {
    const db = await openDatabase();
    if (db) {
      const dbSession = await new Promise<ActiveSession | null>((resolve) => {
        try {
          const transaction = db.transaction([SESSION_STORE], "readonly");
          const store = transaction.objectStore(SESSION_STORE);
          const request = store.get("active_draft");

          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      });

      if (dbSession) {
        inMemorySession = dbSession;
        return dbSession;
      }
    }
  } catch (e) {
    // Fall back to memory
  }

  return inMemorySession;
}

export async function clearActiveSession(): Promise<void> {
  inMemorySession = null;
  safeRemoveLocalStorage(LS_SESSION_KEY);

  try {
    const db = await openDatabase();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction([SESSION_STORE], "readwrite");
        const store = transaction.objectStore(SESSION_STORE);
        const request = store.delete("active_draft");

        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  } catch (e) {
    // Graceful
  }
}
