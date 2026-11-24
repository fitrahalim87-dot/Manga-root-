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
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white border-[1.5px] border-slate-700/85 shadow-[0_18px_40px_-8px_rgba(15,23,42,0.32)] overflow-hidden text-slate-800 max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="bg-[#0066FF] px-5 py-4 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
              <Database className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold leading-tight">
                Database IndexedDB Lokal · v{DB_VERSION}
              </h2>
              <p className="text-[11px] text-blue-100">Penyimpanan lokal mandiri di browser Anda</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-blue-100 hover:text-white rounded-xl hover:bg-white/15 transition active:scale-95 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto [scrollbar-width:none]">
          {/* Feedback Alert */}
          {feedback && (
            <div className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fadeIn ${
              feedback.type === "success" 
                ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                : "bg-rose-50 border border-rose-200 text-rose-800"
            }`}>
              {feedback.type === "success" ? <Check className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />}
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Status Card & Quota Bar */}
          <div className="p-4 bg-[#F8FAFC] border border-slate-600/75 rounded-xl shadow-sm shadow-slate-900/10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-[#0066FF]" />
                <span className="text-xs font-bold text-slate-900">Kapasitas Storage Browser</span>
              </div>
              <button
                onClick={refreshStats}
                disabled={isLoading}
                className="text-xs font-semibold text-slate-500 hover:text-[#0066FF] flex items-center gap-1 transition cursor-pointer"
                title="Refresh status storage"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-[#0066FF]" : ""}`} />
                <span>Segarkan</span>
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono tabular-nums">
                <span className="text-slate-600">Terpakai: <strong className="text-slate-900">{storage.usageMB} MB</strong></span>
                <span className="text-slate-500">Kuota: ~{storage.quotaMB} MB ({storage.percent}%)</span>
              </div>
              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#0066FF] transition-all duration-500 rounded-full"
                  style={{ width: `${Math.max(2, Math.min(100, storage.percent))}%` }}
                />
              </div>
            </div>

            {/* Object Stores Info Grid */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 text-center">
              <div className="p-2.5 bg-white border border-slate-600/70 rounded-xl shadow-xs shadow-slate-900/10">
                <FileText className="w-4 h-4 mx-auto mb-1 text-[#0066FF]" />
                <p className="text-sm font-bold text-slate-900 tabular-nums">{scriptsCount}</p>
                <p className="text-[11px] text-slate-500">{STORE_SCRIPTS}</p>
              </div>
              <div className="p-2.5 bg-white border border-slate-600/70 rounded-xl shadow-xs shadow-slate-900/10">
                <Layers className="w-4 h-4 mx-auto mb-1 text-[#0066FF]" />
                <p className="text-sm font-bold text-slate-900">Aktif</p>
                <p className="text-[11px] text-slate-500">{STORE_SESSIONS}</p>
              </div>
              <div className="p-2.5 bg-white border border-slate-600/70 rounded-xl shadow-xs shadow-slate-900/10">
                <Sparkles className="w-4 h-4 mx-auto mb-1 text-[#0066FF]" />
                <p className="text-sm font-bold text-slate-900 tabular-nums">{presetsCount}</p>
                <p className="text-[11px] text-slate-500">{STORE_PRESETS}</p>
              </div>
            </div>
          </div>

          {/* Database Benefits Info Box */}
          <div className="p-3.5 bg-blue-50 border border-slate-600/70 rounded-xl shadow-xs shadow-slate-900/10 flex items-start gap-2.5 text-xs text-slate-700">
            <Info className="w-4 h-4 text-[#0066FF] shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold text-slate-900">Database Berjalan 100% di Perangkat Anda</p>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Database <code className="text-[#0066FF] font-mono">{DB_NAME}</code> menyimpan naskah, gambar manga, dan konfigurasi secara lokal di browser Anda.
              </p>
            </div>
          </div>

          {/* Action Buttons: Export & Import */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700">
              Cadangan & Pemulihan (Backup & Restore)
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={handleExport}
                disabled={isLoading}
                className="min-h-[42px] p-3 bg-white border border-slate-200 hover:border-[#0066FF] hover:bg-blue-50/50 text-xs font-semibold text-slate-800 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Download className="w-4 h-4 text-[#0066FF]" />
                <span>Ekspor JSON</span>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="min-h-[42px] p-3 bg-white border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 text-xs font-semibold text-slate-800 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Upload className="w-4 h-4 text-emerald-600" />
                <span>Impor JSON</span>
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
          <div className="pt-3 border-t border-slate-200 space-y-2">
            <label className="text-xs font-semibold text-rose-700">
              Pembersihan Data
            </label>

            {!confirmReset ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleClearScripts}
                  disabled={isLoading || scriptsCount === 0}
                  className="flex-1 min-h-[40px] py-2 px-3 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-300 text-rose-600 disabled:opacity-40 text-xs font-semibold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Bersihkan Riwayat</span>
                </button>

                <button
                  onClick={() => setConfirmReset(true)}
                  disabled={isLoading}
                  className="min-h-[40px] py-2 px-3.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl transition cursor-pointer"
                >
                  Reset Database...
                </button>
              </div>
            ) : (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-2.5 animate-fadeIn">
                <div className="flex items-center gap-2 text-rose-800 text-xs font-bold">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Konfirmasi Reset Total Database?</span>
                </div>
                <p className="text-[11px] text-rose-700 leading-relaxed">
                  Tindakan ini akan mengosongkan seluruh riwayat naskah, draft aktif, dan preset karakter dari IndexedDB.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => setConfirmReset(false)}
                    className="flex-1 min-h-[38px] py-2 px-3 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-xl transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleFullReset}
                    className="flex-1 min-h-[38px] py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    Ya, Hapus Semua
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
