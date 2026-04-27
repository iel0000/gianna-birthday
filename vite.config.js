import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base ('./') makes asset URLs portable: works at the site root,
// at /<repo>/ on GitHub Pages, or behind a custom domain — no rebuild needed.
// Override with VITE_BASE_PATH (e.g. "/my-repo/") for absolute paths.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || './',
  plugins: [react()],
  server: {
    port: 5173,
    open: true
  }
});
