import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download } from 'lucide-react';

interface PWAInstallButtonProps {
  variant?: 'header' | 'settings';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'header' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`flex items-center gap-2 rounded-xl bg-[#0066FF] hover:bg-[#0052CC] text-white font-semibold shadow-sm transition active:scale-95 cursor-pointer whitespace-nowrap shrink-0 ${
          variant === 'settings' ? 'w-full justify-center px-4 py-2.5 text-xs' : 'px-3 py-2 text-xs'
        }`}
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install Aplikasi</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 text-[#0066FF] hover:bg-blue-100 font-semibold transition active:scale-95 cursor-pointer whitespace-nowrap shrink-0 ${
            variant === 'settings' ? 'w-full justify-center px-4 py-2.5 text-xs' : 'px-3 py-2 text-xs'
          }`}
        >
          <Download className="w-3.5 h-3.5" />
          <span>Install</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl bg-white border-[1.5px] border-slate-700/85 p-6 shadow-[0_18px_40px_-8px_rgba(15,23,42,0.32)]">
              <h3 className="text-base font-bold text-slate-900 mb-2">Install di iPhone</h3>
              <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                1. Ketuk tombol <strong>Bagikan (Share)</strong> di toolbar Safari.<br />
                2. Gulir ke bawah dan ketuk <strong>Tambah ke Layar Utama (Add to Home Screen)</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-xl bg-[#0066FF] py-2.5 text-xs font-bold text-white hover:bg-[#0052CC] cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
