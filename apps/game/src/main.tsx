import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { PoseGallery } from './dev/PoseGallery';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    {/* `?poses` shows every pose of the hero, for tuning them by eye. */}
    {import.meta.env.DEV && new URLSearchParams(location.search).has('poses') ? (
      <PoseGallery />
    ) : (
      <App />
    )}
  </StrictMode>,
);
