import { RecapScript, ActiveSession } from "../types";

const DB_NAME = "manga_recap_db";
const STORE_NAME = "scripts";
const SESSION_STORE = "sessions";
const DB_VERSION = 3;

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error("IndexedDB open error:", (event.target as IDBOpenDBRequest).error);
      reject(new Error(`Gagal membuka database IndexedDB: ${(event.target as IDBOpenDBRequest).error?.message}`));
    };

    request.onblocked = () => {
      console.warn("IndexedDB open blocked. Please close other tabs.");
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE, { keyPath: "id" });
      }
    };
  });
}

export async function saveRecapScript(script: RecapScript): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(script);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error("Gagal menyimpan naskah ke IndexedDB"));
    };
  });
}

export async function getAllRecapScripts(): Promise<RecapScript[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      // Sort newest first
      const results = request.result as RecapScript[];
      results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      resolve(results);
    };

    request.onerror = () => {
      reject(new Error("Gagal memuat daftar naskah dari IndexedDB"));
    };
  });
}

export async function deleteRecapScript(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error("Gagal menghapus naskah dari IndexedDB"));
    };
  });
}

export async function saveActiveSession(session: ActiveSession): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SESSION_STORE], "readwrite");
    const store = transaction.objectStore(SESSION_STORE);
    const request = store.put(session);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error("Gagal menyimpan session aktif ke IndexedDB"));
    };
  });
}

export async function getActiveSession(): Promise<ActiveSession | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SESSION_STORE], "readonly");
    const store = transaction.objectStore(SESSION_STORE);
    const request = store.get("active_draft");

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      reject(new Error("Gagal mengambil session aktif dari IndexedDB"));
    };
  });
}

export async function clearActiveSession(): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SESSION_STORE], "readwrite");
    const store = transaction.objectStore(SESSION_STORE);
    const request = store.delete("active_draft");

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error("Gagal menghapus session aktif dari IndexedDB"));
    };
  });
}

