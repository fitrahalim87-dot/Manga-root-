import React, { useState } from "react";
import {
  Sparkles,
  Key,
  Eye,
  EyeOff,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Globe,
  Bot,
  PlugZap,
  ShieldCheck
} from "lucide-react";
import { ProviderType } from "../types";

interface ApiKeyGateProps {
  googleApiKey: string;
  kieApiKey: string;
  openrouterApiKey: string;
  onEnterStudio: (keys: {
    googleApiKey: string;
    kieApiKey: string;
    openrouterApiKey: string;
    preferredProvider?: ProviderType;
  }) => void;
}

interface TestState {
  status: "idle" | "loading" | "success" | "error";
  message?: string;
}

export const ApiKeyGate: React.FC<ApiKeyGateProps> = ({
  googleApiKey,
  kieApiKey,
  openrouterApiKey,
  onEnterStudio
}) => {
  const [tempGoogle, setTempGoogle] = useState(googleApiKey);
  const [tempKie, setTempKie] = useState(kieApiKey);
  const [tempOpenrouter, setTempOpenrouter] = useState(openrouterApiKey);

  const [showGoogle, setShowGoogle] = useState(false);
  const [showKie, setShowKie] = useState(false);
  const [showOpenrouter, setShowOpenrouter] = useState(false);

  const [testStates, setTestStates] = useState<Record<ProviderType, TestState>>({
    google: { status: "idle" },
    kie: { status: "idle" },
    openrouter: { status: "idle" }
  });

  const cleanGoogle = tempGoogle.trim();
  const cleanKie = tempKie.trim();
  const cleanOpenrouter = tempOpenrouter.trim();
  const hasAnyKey = Boolean(cleanGoogle || cleanKie || cleanOpenrouter);
  const configuredCount = [cleanGoogle, cleanKie, cleanOpenrouter].filter(Boolean).length;

  const persistKeyToStorage = (provider: ProviderType, value: string) => {
    const trimmed = value.trim();
    const storageKey =
      provider === "google"
        ? "mangaroot_gemini_api_key"
        : provider === "kie"
        ? "mangaroot_kie_api_key"
        : "mangaroot_openrouter_api_key";
    try {
      if (trimmed) localStorage.setItem(storageKey, trimmed);
      else localStorage.removeItem(storageKey);
    } catch (_) {}
  };

  const handleTestConnection = async (provider: ProviderType) => {
    const keyToTest =
      provider === "google"
        ? cleanGoogle
        : provider === "kie"
        ? cleanKie
        : cleanOpenrouter;

    if (!keyToTest) {
      setTestStates((prev) => ({
        ...prev,
        [provider]: { status: "error", message: "Masukkan API Key terlebih dahulu sebelum tes koneksi." }
      }));
      return;
    }

    setTestStates((prev) => ({
      ...prev,
      [provider]: { status: "loading", message: "Menguji koneksi ke server provider..." }
    }));

    try {
      const response = await fetch("/api/test-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: keyToTest })
      });
      const data = await response.json();
      if (response.ok && data.ok) {
        persistKeyToStorage(provider, keyToTest);
        setTestStates((prev) => ({
          ...prev,
          [provider]: { status: "success", message: data.message || "Koneksi berhasil!" }
        }));
      } else {
        setTestStates((prev) => ({
          ...prev,
          [provider]: { status: "error", message: data.error || "API Key tidak valid." }
        }));
      }
    } catch (err: any) {
      setTestStates((prev) => ({
        ...prev,
        [provider]: { status: "error", message: err?.message || "Gagal menghubungi server." }
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasAnyKey) return;

    persistKeyToStorage("google", cleanGoogle);
    persistKeyToStorage("kie", cleanKie);
    persistKeyToStorage("openrouter", cleanOpenrouter);

    let preferredProvider: ProviderType = "google";
    if (cleanGoogle) preferredProvider = "google";
    else if (cleanOpenrouter) preferredProvider = "openrouter";
    else if (cleanKie) preferredProvider = "kie";

    onEnterStudio({
      googleApiKey: cleanGoogle,
      kieApiKey: cleanKie,
      openrouterApiKey: cleanOpenrouter,
      preferredProvider
    });
  };

  const renderTestStatus = (provider: ProviderType) => {
    const state = testStates[provider];
    if (state.status === "idle") return null;

    if (state.status === "loading") {
      return (
        <div className="flex items-center gap-2 text-xs text-slate-700 bg-slate-100 border border-slate-200 rounded-xl px-3 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0066FF] shrink-0" />
          <span>{state.message}</span>
        </div>
      );
    }

    if (state.status === "success") {
      return (
        <div className="flex items-start gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span className="leading-snug">{state.message}</span>
        </div>
      );
    }

    return (
      <div className="flex items-start gap-2 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
        <span className="leading-snug">{state.message}</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen w-full bg-[#F4F7FB] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-2xl bg-white border-[1.5px] border-slate-700/80 rounded-3xl shadow-[0_14px_34px_-6px_rgba(15,23,42,0.22),0_4px_12px_-2px_rgba(15,23,42,0.12)] overflow-hidden">
        {/* Top Blue Studio Header */}
        <div className="bg-[#0066FF] px-6 py-5 text-white flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight leading-tight">MangaRoot</h1>
              <p className="text-xs text-blue-100 font-medium">Creator Studio · Pengaturan Awal API Key</p>
            </div>
          </div>
          <span className="text-xs font-medium text-blue-100 whitespace-nowrap shrink-0">
            v.1.6
          </span>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-2">
            <p className="text-sm text-slate-600 leading-relaxed">
              Masukkan minimal <strong className="text-slate-900">1 API Key</strong> dari provider pilihan Anda di bawah ini untuk membuka dashboard. Semua key bersifat opsional dan tersimpan otomatis di perangkat Anda.
            </p>

            {hasAnyKey ? (
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>{configuredCount}</strong> provider siap digunakan. Klik tombol <strong>Masuk</strong> untuk langsung ke studio.
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                <Key className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Isi minimal salah satu API Key agar tombol Masuk aktif.</span>
              </div>
            )}
          </div>

          <div className="space-y-3.5">
            {/* Provider 1: Google AI Studio */}
            <div className="bg-[#F8FAFC] border border-slate-600/75 rounded-2xl p-4 shadow-sm shadow-slate-900/10 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#0066FF] shrink-0" />
                  <span className="text-sm font-bold text-slate-900">Google AI Studio</span>
                  <span className="text-xs text-slate-400">· Opsional</span>
                </div>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-[#0066FF] hover:underline flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <span>Dapatkan Key</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showGoogle ? "text" : "password"}
                    placeholder="AIzaSy... (Google AI Studio API Key)"
                    value={tempGoogle}
                    onChange={(e) => {
                      setTempGoogle(e.target.value);
                      setTestStates((prev) => ({ ...prev, google: { status: "idle" } }));
                    }}
                    className="w-full min-h-[42px] pl-3.5 pr-10 py-2 bg-white border border-slate-200 focus:border-[#0066FF] focus:ring-2 focus:ring-blue-500/15 text-slate-900 text-xs font-mono rounded-xl outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGoogle(!showGoogle)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                    aria-label="Tampilkan atau sembunyikan Google API Key"
                  >
                    {showGoogle ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleTestConnection("google")}
                  disabled={testStates.google.status === "loading"}
                  className="min-h-[42px] px-3.5 bg-white hover:bg-blue-50 border border-slate-200 hover:border-[#0066FF]/40 text-[#0066FF] text-xs font-semibold rounded-xl transition flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  <PlugZap className="w-3.5 h-3.5" />
                  <span>Tes</span>
                </button>
              </div>
              {renderTestStatus("google")}
            </div>

            {/* Provider 2: Kie.ai */}
            <div className="bg-[#F8FAFC] border border-slate-600/75 rounded-2xl p-4 shadow-sm shadow-slate-900/10 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[#0066FF] shrink-0" />
                  <span className="text-sm font-bold text-slate-900">Kie.ai</span>
                  <span className="text-xs text-slate-400">· Opsional</span>
                </div>
                <a
                  href="https://kie.ai/id/api-key"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-[#0066FF] hover:underline flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <span>Dapatkan Key</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showKie ? "text" : "password"}
                    placeholder="kie-... (Kie.ai API Key)"
                    value={tempKie}
                    onChange={(e) => {
                      setTempKie(e.target.value);
                      setTestStates((prev) => ({ ...prev, kie: { status: "idle" } }));
                    }}
                    className="w-full min-h-[42px] pl-3.5 pr-10 py-2 bg-white border border-slate-200 focus:border-[#0066FF] focus:ring-2 focus:ring-blue-500/15 text-slate-900 text-xs font-mono rounded-xl outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKie(!showKie)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                    aria-label="Tampilkan atau sembunyikan Kie.ai API Key"
                  >
                    {showKie ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleTestConnection("kie")}
                  disabled={testStates.kie.status === "loading"}
                  className="min-h-[42px] px-3.5 bg-white hover:bg-blue-50 border border-slate-200 hover:border-[#0066FF]/40 text-[#0066FF] text-xs font-semibold rounded-xl transition flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  <PlugZap className="w-3.5 h-3.5" />
                  <span>Tes</span>
                </button>
              </div>
              {renderTestStatus("kie")}
            </div>

            {/* Provider 3: OpenRouter */}
            <div className="bg-[#F8FAFC] border border-slate-600/75 rounded-2xl p-4 shadow-sm shadow-slate-900/10 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-[#0066FF] shrink-0" />
                  <span className="text-sm font-bold text-slate-900">OpenRouter</span>
                  <span className="text-xs text-slate-400">· Opsional</span>
                </div>
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-[#0066FF] hover:underline flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <span>Dapatkan Key</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showOpenrouter ? "text" : "password"}
                    placeholder="sk-or-v1-... (OpenRouter API Key)"
                    value={tempOpenrouter}
                    onChange={(e) => {
                      setTempOpenrouter(e.target.value);
                      setTestStates((prev) => ({ ...prev, openrouter: { status: "idle" } }));
                    }}
                    className="w-full min-h-[42px] pl-3.5 pr-10 py-2 bg-white border border-slate-200 focus:border-[#0066FF] focus:ring-2 focus:ring-blue-500/15 text-slate-900 text-xs font-mono rounded-xl outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOpenrouter(!showOpenrouter)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                    aria-label="Tampilkan atau sembunyikan OpenRouter API Key"
                  >
                    {showOpenrouter ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleTestConnection("openrouter")}
                  disabled={testStates.openrouter.status === "loading"}
                  className="min-h-[42px] px-3.5 bg-white hover:bg-blue-50 border border-slate-200 hover:border-[#0066FF]/40 text-[#0066FF] text-xs font-semibold rounded-xl transition flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  <PlugZap className="w-3.5 h-3.5" />
                  <span>Tes</span>
                </button>
              </div>
              {renderTestStatus("openrouter")}
            </div>
          </div>

          {/* Primary Masuk Button */}
          <button
            type="submit"
            disabled={!hasAnyKey}
            className={`w-full min-h-[48px] py-3 px-5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              hasAnyKey
                ? "bg-[#0066FF] hover:bg-[#0052CC] text-white cursor-pointer active:scale-[0.99] shadow-sm"
                : "bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            <span>Masuk</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
