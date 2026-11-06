import React, { useState, useEffect } from "react";
import { 
  X, 
  Key, 
  Sparkles, 
  ExternalLink, 
  Check, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  ShieldCheck,
  Trash2,
  Globe,
  Bot
} from "lucide-react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProvider?: "google" | "kie";
  setActiveProvider?: (provider: "google" | "kie") => void;
  googleApiKey: string;
  setGoogleApiKey: (key: string) => void;
  kieApiKey?: string;
  setKieApiKey?: (key: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  googleApiKey,
  setGoogleApiKey,
}) => {
  const [tempGoogleKey, setTempGoogleKey] = useState(googleApiKey);
  const [showGoogleKey, setShowGoogleKey] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Sync temp state whenever modal opens or props update
  useEffect(() => {
    setTempGoogleKey(googleApiKey);
  }, [googleApiKey, isOpen]);

  if (!isOpen) return null;

  const isConfigured = Boolean(tempGoogleKey.trim());

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanGoogle = tempGoogleKey.trim();
    
    setGoogleApiKey(cleanGoogle);
    localStorage.setItem("mangaroot_active_provider", "google");

    if (cleanGoogle) {
      localStorage.setItem("mangaroot_gemini_api_key", cleanGoogle);
    } else {
      localStorage.removeItem("mangaroot_gemini_api_key");
    }

    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1000);
  };

  const handleClearCurrent = () => {
    setTempGoogleKey("");
    setGoogleApiKey("");
    localStorage.removeItem("mangaroot_gemini_api_key");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-5 text-slate-200 overflow-y-auto max-h-[90vh] [scrollbar-width:none]">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-950/50">
              <Key className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-white">Pengaturan Google AI Studio</h2>
              <p className="text-[10px] text-slate-400 font-mono">Masukkan Kunci Akses Resmi Google Gemini</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition active:scale-95 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Alert Banner */}
        {isConfigured ? (
          <div className="flex items-center gap-3 p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400">
            <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-400" />
            <div className="text-xs">
              <p className="font-bold">API Key Google AI Studio Aktif</p>
              <p className="text-[10px] text-emerald-500/80">Kunci tersimpan dan siap digunakan untuk generate naskah manga.</p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-300">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5 animate-pulse" />
            <div className="text-xs space-y-1">
              <p className="font-extrabold text-rose-200">API Key Google AI Studio Belum Diisi</p>
              <p className="text-[10px] text-rose-300/80 leading-relaxed">
                Silakan ikuti petunjuk di bawah ini untuk mendapatkan API Key Google AI Studio gratis.
              </p>
            </div>
          </div>
        )}

        {/* Panduan Pembuatan API Key Google AI Studio */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
          <h3 className="text-xs font-bold text-amber-400 flex items-center gap-1.5 font-mono uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            Panduan API Key Google AI Studio (Gratis)
          </h3>

          <ol className="space-y-2 text-[11px] text-slate-300 list-decimal list-inside leading-snug">
            <li className="pl-1">
              Klik tombol <strong className="text-white">"Buka Google AI Studio"</strong> di bawah.
            </li>
            <li className="pl-1">
              Login akun Google Anda, lalu klik <strong className="text-indigo-300">"Create API Key"</strong>.
            </li>
            <li className="pl-1">
              Salin kode kunci yang dihasilkan (dimulai dengan kata <code className="bg-slate-900 px-1 py-0.5 rounded text-amber-300 font-mono">AIzaSy...</code>).
            </li>
            <li className="pl-1">
              Tempel kode ke kolom di bawah lalu klik <strong className="text-emerald-300">"Simpan API Key"</strong>.
            </li>
          </ol>

          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-slate-950 hover:text-white font-black text-xs rounded-xl shadow-lg shadow-indigo-950/50 transition-all flex items-center justify-center gap-2 active:scale-98 cursor-pointer font-sans"
          >
            <Sparkles className="w-4 h-4 fill-slate-950" />
            <span>Buka Google AI Studio (https://aistudio.google.com/app/apikey)</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Form Input */}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-300 flex items-center justify-between font-mono uppercase">
              <span>Google Gemini API Key</span>
              <span className="text-[9px] text-amber-400 font-normal lowercase">(Google AI Studio)</span>
            </label>
            <div className="relative">
              <input
                type={showGoogleKey ? "text" : "password"}
                placeholder="AIzaSy... (Tempel API Key Google Gemini di sini)"
                value={tempGoogleKey}
                onChange={(e) => setTempGoogleKey(e.target.value)}
                required
                className="w-full pl-3.5 pr-10 py-2.5 bg-slate-950 border border-slate-800 focus:border-indigo-500 text-white text-xs font-mono rounded-xl outline-none transition"
              />
              <button
                type="button"
                onClick={() => setShowGoogleKey(!showGoogleKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                {showGoogleKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            {isConfigured && (
              <button
                type="button"
                onClick={handleClearCurrent}
                className="p-2.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-slate-800 rounded-xl transition cursor-pointer"
                title="Hapus API Key Google"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              type="submit"
              className={`flex-1 py-3 px-4 font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 active:scale-98 cursor-pointer ${
                savedSuccess
                  ? "bg-emerald-600 text-white"
                  : "bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white"
              }`}
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4 text-white" />
                  <span>Pengaturan & Key Tersimpan!</span>
                </>
              ) : (
                <span>Simpan API Key</span>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
