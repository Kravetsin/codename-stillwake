import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ArtGallery } from './dev/ArtGallery';
import { PoseGallery } from './dev/PoseGallery';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');
const gallery = new URLSearchParams(location.search);

createRoot(root).render(
  <StrictMode>
    {/* `?poses` and `?art` show every pose of the hero and every tile, for judging them by eye. */}
    {import.meta.env.DEV && gallery.has('poses') ? (
      <PoseGallery />
    ) : import.meta.env.DEV && gallery.has('art') ? (
      <ArtGallery />
    ) : (
      <App />
    )}
  </StrictMode>,
);
