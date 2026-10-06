import { createRoot } from 'react-dom/client';
import Home from '../app/page';
import '../app/globals.css';

const assetBase = import.meta.env.BASE_URL.replace(/\/$/, '');
createRoot(document.getElementById('root')!).render(<Home assetBase={assetBase} syncEndpoint={import.meta.env.VITE_SYNC_ENDPOINT || undefined} />);

// One worker scope per deployed product directory; API responses are never cached.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL, updateViaCache: 'none' });
  });
}
