import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Register PWA service worker with auto update
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('PWA: Versi baru tersedia');
  },
  onOfflineReady() {
    console.log('PWA: Siap digunakan secara offline');
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
