import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../lib/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-rose-600/90 backdrop-blur-md px-3.5 py-1.5 text-xs font-semibold text-white shadow-xl border border-rose-400/30 animate-pulse">
      <WifiOff className="w-3.5 h-3.5" />
      <span>Mode Offline — Data tersimpan secara lokal</span>
    </div>
  );
};
