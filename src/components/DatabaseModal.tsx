import React, { useState, useEffect, useRef } from "react";
import { 
  X, 
  Database, 
  HardDrive, 
  Download, 
  Upload, 
  Trash2, 
  RefreshCw, 
  Check, 
  AlertTriangle, 
  Layers, 
  FileText, 
  Sparkles,
  Info
} from "lucide-react";
import { 
  DB_NAME, 
  DB_VERSION, 
  STORE_SCRIPTS, 
  STORE_SESSIONS, 
  STORE_PRESETS,
  getStorageUsage, 
  exportDatabaseJSON, 
  importDatabaseJSON, 
  clearAllRecapScripts, 
  resetEntireDatabase,
  getAllRecapScripts,
  getAllPresets
} from "../lib/db";

interface DatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataChanged: () => void;
}

export const DatabaseModal: React.FC<DatabaseModalProps> = ({
  isOpen,
  onClose,
  onDataChanged
}) => {
  const [storage, setStorage] = useState<{ usageMB: number; quotaMB: number; percent: number }>({
    usageMB: 0,
    quotaMB: 0,
    percent: 0
  });
  const [scriptsCount, setScriptsCount] = useState<number>(0);
  const [presetsCount, setPresetsCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState<boolean>(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshStats = async () => {
    setIsLoading(true);
    try {
      const [storageInfo, scripts, presets] = await Promise.all([
        getStorageUsage(),
        getAllRecapScripts(),
        getAllPresets()
      ]);
      setStorage(storageInfo);
      setScriptsCount(scripts.length);
      setPresetsCount(presets.length);
    } catch (e) {
      console.error("Gagal memuat info database:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshStats();
      setFeedback(null);
      setConfirmReset(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const showNotification = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback(null);
    }, 3500);
  };

  // 1. Export entire database to JSON
  const handleExport = async () => {
    setIsLoading(true);
    try {
      const jsonStr = await exportDatabaseJSON();
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `mangaroot_database_backup_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showNotification("success", "Backup database IndexedDB berhasil diunduh!");
    } catch (err: any) {
      showNotification("error", `Gagal mengekspor database: ${err?.message || "Error"}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Import database from JSON
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const text = await file.text();
      const result = await importDatabaseJSON(text);
      await refreshStats();
      onDataChanged();
      showNotification("success", `Berhasil memulihkan ${result.scriptsCount} naskah & ${result.presetsCount} preset!`);
    } catch (err: any) {
      showNotification("error", `File JSON backup tidak valid: ${err?.message || "Error parsing"}`);
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // 3. Clear all recap scripts only
  const handleClearScripts = async () => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus SEMUA riwayat naskah? Tindakan ini tidak dapat dibatalkan.")) {
      return;
    }
    setIsLoading(true);
    try {
      await clearAllRecapScripts();
      await refreshStats();
      onDataChanged();
      showNotification("success", "Seluruh riwayat naskah berhasil dibersihkan.");
    } catch (err: any) {
      showNotification("error", `Gagal membersihkan naskah: ${err?.message || "Error"}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Reset entire database
  const handleFullReset = async () => {
    setIsLoading(true);
    try {
      await resetEntireDatabase();
      await refreshStats();
      onDataChanged();
      setConfirmReset(false);
      showNotification("success", "Database IndexedDB telah di-reset ke kondisi awal.");
    } catch (err: any) {
      showNotification("error", `Gagal mereset database: ${err?.message || "Error"}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-5 text-slate-200 overflow-y-auto max-h-[90vh] [scrollbar-width:none]">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-rose-950/50">
              <Database className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                Penyimpanan & Database IndexedDB
                <span className="px-1.5 py-0.5 text-[9px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">
                  v{DB_VERSION}
                </span>
              </h2>
              <p className="text-[10px] text-slate-400 font-mono">Penyimpanan Lokal Mandiri di Browser Anda</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition active:scale-95 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 animate-fadeIn ${
            feedback.type === "success" 
              ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/15 border border-rose-500/30 text-rose-300"
          }`}>
            {feedback.type === "success" ? <Check className="w-4 h-4 shrink-0 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Status Card & Quota Bar */}
        <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-rose-500" />
              <span className="text-xs font-bold text-slate-200">Kapasitas Storage Browser</span>
            </div>
            <button
              onClick={refreshStats}
              disabled={isLoading}
              className="text-[10px] font-mono text-slate-400 hover:text-rose-400 flex items-center gap-1 transition cursor-pointer"
              title="Refresh status storage"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin text-rose-400" : ""}`} />
              <span>Segarkan</span>
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] font-mono">
              <span className="text-slate-400">Terpakai: <strong className="text-white">{storage.usageMB} MB</strong></span>
              <span className="text-slate-500">Batas Kuota: ~{storage.quotaMB} MB ({storage.percent}%)</span>
            </div>
            <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800/80">
              <div 
                className="h-full bg-gradient-to-r from-indigo-500 via-rose-500 to-pink-500 transition-all duration-500 rounded-full"
                style={{ width: `${Math.max(2, Math.min(100, storage.percent))}%` }}
              />
            </div>
          </div>

          {/* Object Stores Info Grid */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-900 text-center">
            <div className="p-2.5 bg-slate-900/60 border border-slate-850 rounded-xl">
              <FileText className="w-4 h-4 mx-auto mb-1 text-indigo-400" />
              <p className="text-xs font-extrabold text-white">{scriptsCount}</p>
              <p className="text-[9px] text-slate-400 font-mono">Naskah ({STORE_SCRIPTS})</p>
            </div>
            <div className="p-2.5 bg-slate-900/60 border border-slate-850 rounded-xl">
              <Layers className="w-4 h-4 mx-auto mb-1 text-amber-400" />
              <p className="text-xs font-extrabold text-white">Aktif</p>
              <p className="text-[9px] text-slate-400 font-mono">Draft ({STORE_SESSIONS})</p>
            </div>
            <div className="p-2.5 bg-slate-900/60 border border-slate-850 rounded-xl">
              <Sparkles className="w-4 h-4 mx-auto mb-1 text-cyan-400" />
              <p className="text-xs font-extrabold text-white">{presetsCount}</p>
              <p className="text-[9px] text-slate-400 font-mono">Preset ({STORE_PRESETS})</p>
            </div>
          </div>
        </div>

        {/* Database Benefits Info Box */}
        <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-start gap-2.5 text-xs text-indigo-200">
          <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-indigo-300">Database Berjalan 100% di Perangkat Anda</p>
            <p className="text-[10px] text-indigo-200/80 leading-relaxed">
              Database bernama <code className="text-amber-300 font-mono">{DB_NAME}</code> menyimpan naskah, gambar manga, dan konfigurasi secara offline tanpa mengirim data privat Anda ke database server eksternal.
            </p>
          </div>
        </div>

        {/* Action Buttons: Export & Import */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider">
            Cadangan & Pemulihan (Backup & Restore)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleExport}
              disabled={isLoading}
              className="p-3 bg-slate-950 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-900 text-xs font-bold text-slate-200 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer active:scale-98"
            >
              <Download className="w-4 h-4 text-indigo-400" />
              <span>Ekspor Backup JSON</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="p-3 bg-slate-950 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-900 text-xs font-bold text-slate-200 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer active:scale-98"
            >
              <Upload className="w-4 h-4 text-emerald-400" />
              <span>Impor / Pulihkan</span>
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImportFile} 
              accept=".json" 
              className="hidden" 
            />
          </div>
        </div>

        {/* Danger Zone: Clear / Reset */}
        <div className="pt-2 border-t border-slate-800 space-y-2">
          <label className="text-[10px] font-bold text-rose-400/80 font-mono uppercase tracking-wider">
            Pembersihan Data
          </label>

          {!confirmReset ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleClearScripts}
                disabled={isLoading || scriptsCount === 0}
                className="flex-1 py-2.5 px-3 bg-slate-950 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/30 text-rose-400 disabled:opacity-40 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Bersihkan Riwayat Naskah</span>
              </button>

              <button
                onClick={() => setConfirmReset(true)}
                disabled={isLoading}
                className="py-2.5 px-3 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Reset Database...
              </button>
            </div>
          ) : (
            <div className="p-3.5 bg-rose-950/40 border border-rose-800/80 rounded-2xl space-y-2.5 animate-fadeIn">
              <div className="flex items-center gap-2 text-rose-300 text-xs font-bold">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Konfirmasi Reset Total Database?</span>
              </div>
              <p className="text-[10px] text-rose-300/80 leading-relaxed">
                Tindakan ini akan mengosongkan seluruh riwayat naskah, draft aktif, dan preset karakter dari IndexedDB.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => setConfirmReset(false)}
                  className="flex-1 py-2 px-3 bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  onClick={handleFullReset}
                  className="flex-1 py-2 px-3 bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold rounded-xl transition cursor-pointer shadow-lg shadow-rose-950/50"
                >
                  Ya, Hapus Semua Data
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
