import { createRoot } from 'react-dom/client';
import Home from '../app/page';
import '../app/globals.css';

const assetBase = import.meta.env.BASE_URL.replace(/\/$/, '');
createRoot(document.getElementById('root')!).render(<Home assetBase={assetBase} />);
