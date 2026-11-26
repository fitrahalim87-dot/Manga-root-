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
  Bot,
  PlugZap,
  Loader2,
  CheckCircle2
} from "lucide-react";
import { ProviderType } from "../types";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: ProviderType;
  googleApiKey: string;
  setGoogleApiKey: (key: string) => void;
  kieApiKey: string;
  setKieApiKey: (key: string) => void;
  openrouterApiKey: string;
  setOpenrouterApiKey: (key: string) => void;
}

interface TestResult {
  status: "idle" | "loading" | "success" | "error";
  message?: string;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  initialTab = "google",
  googleApiKey,
  setGoogleApiKey,
  kieApiKey,
  setKieApiKey,
  openrouterApiKey,
  setOpenrouterApiKey
}) => {
  const [activeTab, setActiveTab] = useState<ProviderType>(initialTab);
  const [tempGoogleKey, setTempGoogleKey] = useState(googleApiKey);
  const [tempKieKey, setTempKieKey] = useState(kieApiKey);
  const [tempOpenrouterKey, setTempOpenrouterKey] = useState(openrouterApiKey);

  const [showGoogleKey, setShowGoogleKey] = useState(false);
  const [showKieKey, setShowKieKey] = useState(false);
  const [showOpenrouterKey, setShowOpenrouterKey] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [testResult, setTestResult] = useState<TestResult>({ status: "idle" });

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setTempGoogleKey(googleApiKey);
      setTempKieKey(kieApiKey);
      setTempOpenrouterKey(openrouterApiKey);
      setTestResult({ status: "idle" });
      setSavedSuccess(false);
    }
  }, [googleApiKey, kieApiKey, openrouterApiKey, isOpen, initialTab]);

  if (!isOpen) return null;

  const currentActiveKey = 
    activeTab === "google" ? tempGoogleKey.trim() : 
    activeTab === "kie" ? tempKieKey.trim() : 
    tempOpenrouterKey.trim();

  const isConfigured = Boolean(currentActiveKey);

  const handleTestConnection = async () => {
    if (!currentActiveKey) {
      setTestResult({
        status: "error",
        message: "Masukkan API Key terlebih dahulu sebelum melakukan tes koneksi."
      });
      return;
    }

    setTestResult({ status: "loading", message: "Menguji koneksi ke server provider..." });
    try {
      const response = await fetch("/api/test-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: activeTab,
          apiKey: currentActiveKey
        })
      });
      const rawText = await response.text();
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch (_) {
        data = {
          error: `Server mengembalikan respons tidak valid (${response.status}). Pastikan endpoint /api/test-key aktif.`
        };
      }
      if (response.ok && data.ok) {
        setTestResult({
          status: "success",
          message: data.message || "Koneksi API Key berhasil!"
        });
      } else {
        setTestResult({
          status: "error",
          message: data.error || `API Key gagal diverifikasi (${response.status}).`
        });
      }
    } catch (err: any) {
      setTestResult({
        status: "error",
        message: err?.message || "Gagal menghubungi backend untuk tes koneksi."
      });
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanGoogle = tempGoogleKey.trim();
    const cleanKie = tempKieKey.trim();
    const cleanOpenrouter = tempOpenrouterKey.trim();
    
    setGoogleApiKey(cleanGoogle);
    setKieApiKey(cleanKie);
    setOpenrouterApiKey(cleanOpenrouter);

    try {
      if (cleanGoogle) localStorage.setItem("mangaroot_gemini_api_key", cleanGoogle);
      else localStorage.removeItem("mangaroot_gemini_api_key");

      if (cleanKie) localStorage.setItem("mangaroot_kie_api_key", cleanKie);
      else localStorage.removeItem("mangaroot_kie_api_key");

      if (cleanOpenrouter) localStorage.setItem("mangaroot_openrouter_api_key", cleanOpenrouter);
      else localStorage.removeItem("mangaroot_openrouter_api_key");
    } catch (_) {}

    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 800);
  };

  const handleClearCurrent = () => {
    setTestResult({ status: "idle" });
    if (activeTab === "google") {
      setTempGoogleKey("");
      setGoogleApiKey("");
      try { localStorage.removeItem("mangaroot_gemini_api_key"); } catch (_) {}
    } else if (activeTab === "kie") {
      setTempKieKey("");
      setKieApiKey("");
      try { localStorage.removeItem("mangaroot_kie_api_key"); } catch (_) {}
    } else {
      setTempOpenrouterKey("");
      setOpenrouterApiKey("");
      try { localStorage.removeItem("mangaroot_openrouter_api_key"); } catch (_) {}
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
              <Key className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold leading-tight">Pengaturan & Tes API Key</h2>
              <p className="text-[11px] text-blue-100">Google AI Studio, Kie.ai, atau OpenRouter</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-blue-100 hover:text-white rounded-xl hover:bg-white/15 transition active:scale-95 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto [scrollbar-width:none]">
          {/* Tab Switcher Provider */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Pilih Provider AI</label>
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 border border-slate-200 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("google");
                  setTestResult({ status: "idle" });
                }}
                className={`min-h-[40px] py-2 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === "google"
                    ? "bg-[#0066FF] text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/70"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>AI Studio</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab("kie");
                  setTestResult({ status: "idle" });
                }}
                className={`min-h-[40px] py-2 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === "kie"
                    ? "bg-[#0066FF] text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/70"
                }`}
              >
                <Globe className="w-3.5 h-3.5 shrink-0" />
                <span>Kie.ai</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab("openrouter");
                  setTestResult({ status: "idle" });
                }}
                className={`min-h-[40px] py-2 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === "openrouter"
                    ? "bg-[#0066FF] text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/70"
                }`}
              >
                <Bot className="w-3.5 h-3.5 shrink-0" />
                <span>OpenRouter</span>
              </button>
            </div>
          </div>

          {/* Status Alert Banner */}
          {isConfigured ? (
            <div className="flex items-center gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800">
              <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-600" />
              <div className="text-xs">
                <p className="font-bold">API Key {activeTab === "google" ? "Google AI Studio" : activeTab === "kie" ? "Kie.ai" : "OpenRouter"} Terisi</p>
                <p className="text-[11px] text-emerald-700">Klik tombol Tes Koneksi untuk memastikan key aktif & valid.</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
              <div className="text-xs space-y-0.5">
                <p className="font-bold">API Key Belum Diisi</p>
                <p className="text-[11px] text-rose-700 leading-relaxed">
                  Masukkan kunci akses untuk provider {activeTab === "google" ? "Google AI Studio" : activeTab === "kie" ? "Kie.ai" : "OpenRouter"} di bawah.
                </p>
              </div>
            </div>
          )}

          {/* Guide per Provider */}
          {activeTab === "google" && (
            <div className="bg-[#F8FAFC] border border-slate-600/75 rounded-xl p-3.5 shadow-sm shadow-slate-900/10 space-y-1.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900">Google AI Studio</h3>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#0066FF] hover:underline font-semibold flex items-center gap-1"
                >
                  <span>Dapatkan Key</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Buat API Key gratis di Google AI Studio (diawali <code className="text-[#0066FF] font-mono">AIzaSy...</code>). Mendukung Gemini 4 Hydrogen, 3.1 Flash Lite, 2.5 Flash, 3.5 Flash, & 3.6 Flash.
              </p>
            </div>
          )}

          {activeTab === "kie" && (
            <div className="bg-[#F8FAFC] border border-slate-600/75 rounded-xl p-3.5 shadow-sm shadow-slate-900/10 space-y-1.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900">Kie.ai Engine</h3>
                <a
                  href="https://kie.ai/id/api-key"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#0066FF] hover:underline font-semibold flex items-center gap-1"
                >
                  <span>Dapatkan Key</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Salin API Key dari portal Kie.ai. Mendukung Gemini 4 Hydrogen, Gemini 4 Argon, Gemini 3.8 Flash, atau model custom.
              </p>
            </div>
          )}

          {activeTab === "openrouter" && (
            <div className="bg-[#F8FAFC] border border-slate-600/75 rounded-xl p-3.5 shadow-sm shadow-slate-900/10 space-y-1.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900">OpenRouter AI</h3>
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#0066FF] hover:underline font-semibold flex items-center gap-1"
                >
                  <span>Dapatkan Key</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Buat API Key di OpenRouter (diawali <code className="text-[#0066FF] font-mono">sk-or-v1-...</code>). Mendukung Gemini 3 / 3.5 / 3.6 / 4 Hydrogen / 2.5 Flash dan model custom lainnya.
              </p>
            </div>
          )}

          {/* Form Input */}
          <form onSubmit={handleSave} className="space-y-4">
            {activeTab === "google" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Google AI Studio API Key</label>
                <div className="relative">
                  <input
                    type={showGoogleKey ? "text" : "password"}
                    placeholder="AIzaSy..."
                    value={tempGoogleKey}
                    onChange={(e) => {
                      setTempGoogleKey(e.target.value);
                      setTestResult({ status: "idle" });
                    }}
                    className="w-full min-h-[42px] pl-3.5 pr-10 py-2 bg-white border border-slate-300 focus:border-[#0066FF] focus:ring-2 focus:ring-blue-500/15 text-slate-900 text-xs font-mono rounded-xl outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGoogleKey(!showGoogleKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                  >
                    {showGoogleKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {activeTab === "kie" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Kie.ai API Key</label>
                <div className="relative">
                  <input
                    type={showKieKey ? "text" : "password"}
                    placeholder="kie-..."
                    value={tempKieKey}
                    onChange={(e) => {
                      setTempKieKey(e.target.value);
                      setTestResult({ status: "idle" });
                    }}
                    className="w-full min-h-[42px] pl-3.5 pr-10 py-2 bg-white border border-slate-300 focus:border-[#0066FF] focus:ring-2 focus:ring-blue-500/15 text-slate-900 text-xs font-mono rounded-xl outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKieKey(!showKieKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                  >
                    {showKieKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {activeTab === "openrouter" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">OpenRouter API Key</label>
                <div className="relative">
                  <input
                    type={showOpenrouterKey ? "text" : "password"}
                    placeholder="sk-or-v1-..."
                    value={tempOpenrouterKey}
                    onChange={(e) => {
                      setTempOpenrouterKey(e.target.value);
                      setTestResult({ status: "idle" });
                    }}
                    className="w-full min-h-[42px] pl-3.5 pr-10 py-2 bg-white border border-slate-300 focus:border-[#0066FF] focus:ring-2 focus:ring-blue-500/15 text-slate-900 text-xs font-mono rounded-xl outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOpenrouterKey(!showOpenrouterKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                  >
                    {showOpenrouterKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Test Connection Button & Feedback */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testResult.status === "loading"}
                className="w-full min-h-[42px] py-2.5 px-4 bg-[#F8FAFC] hover:bg-blue-50 border border-slate-200 hover:border-[#0066FF]/40 text-[#0066FF] font-semibold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] disabled:opacity-60"
              >
                {testResult.status === "loading" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#0066FF]" />
                    <span>Menguji Koneksi API Key...</span>
                  </>
                ) : (
                  <>
                    <PlugZap className="w-4 h-4" />
                    <span>Tes Koneksi API Key</span>
                  </>
                )}
              </button>

              {testResult.status === "success" && (
                <div className="flex items-start gap-2.5 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="leading-snug">{testResult.message}</span>
                </div>
              )}

              {testResult.status === "error" && (
                <div className="flex items-start gap-2.5 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span className="leading-snug">{testResult.message}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              {isConfigured && (
                <button
                  type="button"
                  onClick={handleClearCurrent}
                  className="min-h-[44px] px-3.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-xl transition cursor-pointer flex items-center justify-center"
                  title="Hapus Key"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              <button
                type="submit"
                className={`flex-1 min-h-[44px] py-3 px-4 font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 active:scale-[0.99] cursor-pointer ${
                  savedSuccess
                    ? "bg-emerald-600 text-white"
                    : "bg-[#0066FF] hover:bg-[#0052CC] text-white"
                }`}
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-white" />
                    <span>Berhasil Disimpan!</span>
                  </>
                ) : (
                  <span>Simpan API Key</span>
                )}
              </button>
            </div>
          </form>
        </div>

      </div>
    </div>
  );
};
