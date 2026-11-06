import { RecapScript, ActiveSession, CharacterPreset } from "../types";

export const DB_NAME = "manga_recap_db";
export const STORE_SCRIPTS = "scripts";
export const STORE_SESSIONS = "sessions";
export const STORE_PRESETS = "presets";
export const DB_VERSION = 4;

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB tidak didukung pada browser ini."));
      return;
    }

    const openWithVersion = (targetVersion?: number) => {
      const request = targetVersion !== undefined 
        ? indexedDB.open(DB_NAME, targetVersion)
        : indexedDB.open(DB_NAME);

      request.onerror = (event) => {
        const err = (event.target as IDBOpenDBRequest).error;
        if (err?.name === "VersionError" && targetVersion !== undefined) {
          console.warn("IndexedDB VersionError terdeteksi. Mencoba membuka dengan versi yang sudah ada...");
          openWithVersion(undefined);
          return;
        }
        console.error("IndexedDB open error:", err);
        reject(new Error(`Gagal membuka database IndexedDB: ${err?.message || "Unknown error"}`));
      };

      request.onblocked = () => {
        console.warn("IndexedDB open blocked. Silakan tutup tab aplikasi yang lain jika terbuka.");
      };

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Check if any required object store is missing (e.g. from version rollback or skipped migration)
        const requiredStores = [STORE_SCRIPTS, STORE_SESSIONS, STORE_PRESETS];
        const missingStores = requiredStores.filter(store => !db.objectStoreNames.contains(store));

        if (missingStores.length > 0) {
          console.warn(`Object store IndexedDB belum lengkap (${missingStores.join(", ")}). Melakukan self-healing upgrade...`);
          const currentVer = db.version;
          db.close();
          // Open with next version to trigger onupgradeneeded cleanly
          openWithVersion(currentVer + 1);
          return;
        }

        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_SCRIPTS)) {
          db.createObjectStore(STORE_SCRIPTS, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
          db.createObjectStore(STORE_SESSIONS, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_PRESETS)) {
          db.createObjectStore(STORE_PRESETS, { keyPath: "id" });
        }
      };
    };

    openWithVersion(DB_VERSION);
  });
}

// ==========================================
// 1. RECAP SCRIPTS STORE (History)
// ==========================================

export async function saveRecapScript(script: RecapScript): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORE_SCRIPTS], "readwrite");
      const store = transaction.objectStore(STORE_SCRIPTS);
      const request = store.put(script);

      request.onsuccess = () => resolve();
      request.onerror = (e) => reject((e.target as IDBRequest).error || new Error("Gagal menyimpan naskah ke IndexedDB"));
    } catch (err) {
      reject(err);
    }
  });
}

export async function getAllRecapScripts(): Promise<RecapScript[]> {
  const db = await openDatabase();
  if (!db.objectStoreNames.contains(STORE_SCRIPTS)) {
    return [];
  }
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORE_SCRIPTS], "readonly");
      const store = transaction.objectStore(STORE_SCRIPTS);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = (request.result || []) as RecapScript[];
        results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        resolve(results);
      };

      request.onerror = (e) => reject((e.target as IDBRequest).error || new Error("Gagal memuat daftar naskah dari IndexedDB"));
    } catch (err) {
      reject(err);
    }
  });
}

export async function deleteRecapScript(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORE_SCRIPTS], "readwrite");
      const store = transaction.objectStore(STORE_SCRIPTS);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = (e) => reject((e.target as IDBRequest).error || new Error("Gagal menghapus naskah dari IndexedDB"));
    } catch (err) {
      reject(err);
    }
  });
}

export async function clearAllRecapScripts(): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORE_SCRIPTS], "readwrite");
      const store = transaction.objectStore(STORE_SCRIPTS);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = (e) => reject((e.target as IDBRequest).error || new Error("Gagal membersihkan riwayat naskah"));
    } catch (err) {
      reject(err);
    }
  });
}

// ==========================================
// 2. ACTIVE SESSION STORE (Draft Auto-Save)
// ==========================================

export async function saveActiveSession(session: ActiveSession): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORE_SESSIONS], "readwrite");
      const store = transaction.objectStore(STORE_SESSIONS);
      const request = store.put(session);

      request.onsuccess = () => resolve();
      request.onerror = (e) => reject((e.target as IDBRequest).error || new Error("Gagal menyimpan session aktif ke IndexedDB"));
    } catch (err) {
      reject(err);
    }
  });
}

export async function getActiveSession(): Promise<ActiveSession | null> {
  const db = await openDatabase();
  if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
    return null;
  }
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORE_SESSIONS], "readonly");
      const store = transaction.objectStore(STORE_SESSIONS);
      const request = store.get("active_draft");

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = (e) => reject((e.target as IDBRequest).error || new Error("Gagal mengambil session aktif dari IndexedDB"));
    } catch (err) {
      reject(err);
    }
  });
}

export async function clearActiveSession(): Promise<void> {
  const db = await openDatabase();
  if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
    return;
  }
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORE_SESSIONS], "readwrite");
      const store = transaction.objectStore(STORE_SESSIONS);
      const request = store.delete("active_draft");

      request.onsuccess = () => resolve();
      request.onerror = (e) => reject((e.target as IDBRequest).error || new Error("Gagal menghapus session aktif dari IndexedDB"));
    } catch (err) {
      reject(err);
    }
  });
}

// ==========================================
// 3. PRESETS STORE (Character Profiles & Prompts)
// ==========================================

export async function getAllPresets(): Promise<CharacterPreset[]> {
  const db = await openDatabase();
  if (!db.objectStoreNames.contains(STORE_PRESETS)) {
    return [];
  }
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORE_PRESETS], "readonly");
      const store = transaction.objectStore(STORE_PRESETS);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = (request.result || []) as CharacterPreset[];
        results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        resolve(results);
      };
      request.onerror = (e) => reject((e.target as IDBRequest).error || new Error("Gagal memuat preset"));
    } catch (err) {
      reject(err);
    }
  });
}

export async function savePreset(preset: CharacterPreset): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORE_PRESETS], "readwrite");
      const store = transaction.objectStore(STORE_PRESETS);
      const request = store.put(preset);

      request.onsuccess = () => resolve();
      request.onerror = (e) => reject((e.target as IDBRequest).error || new Error("Gagal menyimpan preset"));
    } catch (err) {
      reject(err);
    }
  });
}

export async function deletePreset(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORE_PRESETS], "readwrite");
      const store = transaction.objectStore(STORE_PRESETS);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = (e) => reject((e.target as IDBRequest).error || new Error("Gagal menghapus preset"));
    } catch (err) {
      reject(err);
    }
  });
}

// ==========================================
// 4. DATABASE UTILITIES & BACKUP/RESTORE
// ==========================================

export async function exportDatabaseJSON(): Promise<string> {
  const scripts = await getAllRecapScripts();
  const presets = await getAllPresets();
  const exportPayload = {
    version: DB_VERSION,
    database: DB_NAME,
    exportedAt: new Date().toISOString(),
    scripts,
    presets
  };
  return JSON.stringify(exportPayload, null, 2);
}

export async function importDatabaseJSON(jsonStr: string): Promise<{ scriptsCount: number; presetsCount: number }> {
  const data = JSON.parse(jsonStr);
  let scriptsCount = 0;
  let presetsCount = 0;

  if (Array.isArray(data.scripts)) {
    for (const s of data.scripts) {
      if (s && s.id && s.title) {
        await saveRecapScript(s);
        scriptsCount++;
      }
    }
  }

  if (Array.isArray(data.presets)) {
    for (const p of data.presets) {
      if (p && p.id && p.name) {
        await savePreset(p);
        presetsCount++;
      }
    }
  }

  return { scriptsCount, presetsCount };
}

export async function getStorageUsage(): Promise<{ usageMB: number; quotaMB: number; percent: number }> {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 1;
      const usageMB = +(usage / (1024 * 1024)).toFixed(2);
      const quotaMB = +(quota / (1024 * 1024)).toFixed(0);
      const percent = Math.min(100, +((usage / quota) * 100).toFixed(1));
      return { usageMB, quotaMB, percent };
    } catch (e) {
      console.warn("Storage estimate gagal:", e);
    }
  }
  return { usageMB: 0, quotaMB: 0, percent: 0 };
}

export async function resetEntireDatabase(): Promise<void> {
  const db = await openDatabase();
  const storeNames = Array.from(db.objectStoreNames);
  if (storeNames.length === 0) return;

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(storeNames, "readwrite");
      for (const name of storeNames) {
        transaction.objectStore(name).clear();
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = (e) => reject((e.target as IDBTransaction).error || new Error("Gagal mereset database"));
    } catch (err) {
      reject(err);
    }
  });
}

