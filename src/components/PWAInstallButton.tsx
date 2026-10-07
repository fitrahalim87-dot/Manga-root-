import React, { useState } from 'react';
import { Download, Smartphone, X, Check, Share, PlusSquare } from 'lucide-react';
import { usePWAInstall } from '../lib/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'settings' | 'banner';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'header', className = '' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [installing, setInstalling] = useState(false);

  // If already running inside standalone PWA mode
  if (isInstalled) {
    if (variant === 'settings') {
      return (
        <div className="flex items-center justify-between p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <Check className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs font-bold">Aplikasi Terinstal</p>
              <p className="text-[10px] text-emerald-500/80">Berjalan dalam mode PWA Mandiri</p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 bg-emerald-500/20 rounded-md font-bold uppercase">Aktif</span>
        </div>
      );
    }
    return null;
  }

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }
    if (isInstallable) {
      setInstalling(true);
      try {
        await install();
      } finally {
        setInstalling(false);
      }
    } else {
      // Fallback guide if browser does not trigger beforeinstallprompt automatically
      setShowIOSGuide(true);
    }
  };

  // Header compact pill variant
  if (variant === 'header') {
    return (
      <>
        <button
          onClick={handleInstallClick}
          disabled={installing}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white rounded-xl shadow-lg shadow-indigo-950/40 text-[10px] font-bold tracking-wider uppercase font-mono transition-all active:scale-95 cursor-pointer border border-cyan-400/30 ${className}`}
          title="Instal Mangaroot ke Layar Utama HP / Komputer"
        >
          <Download className="w-3.5 h-3.5 animate-bounce" />
          <span>Instal</span>
        </button>

        {showIOSGuide && (
          <IOSInstallModal onClose={() => setShowIOSGuide(false)} />
        )}
      </>
    );
  }

  // Settings menu card variant
  return (
    <>
      <div className={`p-4 bg-gradient-to-br from-indigo-950/40 to-slate-900 border border-indigo-500/30 rounded-2xl space-y-3 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-950/50">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                Instal Mangaroot ke HP
                <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-full font-mono uppercase">PWA</span>
              </h4>
              <p className="text-[11px] text-slate-400 leading-snug">
                Jalankan aplikasi langsung dari Home Screen dengan ikon khusus.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleInstallClick}
          disabled={installing}
          className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-950/40 transition-all flex items-center justify-center gap-2 active:scale-98 cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>{installing ? 'Memproses...' : 'Pasang Aplikasi Sekarang'}</span>
        </button>
      </div>

      {showIOSGuide && (
        <IOSInstallModal onClose={() => setShowIOSGuide(false)} />
      )}
    </>
  );
};

// Modal for guided installation (iOS Safari or standard browsers fallback)
const IOSInstallModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4 text-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-indigo-400" />
            </div>
            <h3 className="text-sm font-extrabold text-white">Pasang di Layar HP</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs text-slate-300">
          <p className="text-slate-400">
            Untuk memasang <strong>Mangaroot</strong> ke layar beranda HP Anda:
          </p>
          
          <div className="space-y-2.5 bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                1
              </div>
              <p>
                Buka menu peramban atau tekan tombol <Share className="w-3.5 h-3.5 inline text-indigo-400 mx-1" /> <strong>Bagikan (Share)</strong> di Safari / Chrome.
              </p>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                2
              </div>
              <p>
                Pilih menu <PlusSquare className="w-3.5 h-3.5 inline text-cyan-400 mx-1" /> <strong>Tambahkan ke Layar Utama</strong> (<em>Add to Home Screen</em>).
              </p>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                3
              </div>
              <p>
                Tekan <strong>Tambah</strong>. Ikon Mangaroot akan muncul di beranda HP Anda!
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition cursor-pointer"
        >
          Mengerti
        </button>
      </div>
    </div>
  );
};
