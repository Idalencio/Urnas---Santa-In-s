import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
export default defineConfig({
  plugins: [react()],
  css: { postcss: { plugins: [tailwindcss()] } },
  build: { outDir: '../public', emptyOutDir: false, sourcemap: false },
  server: { proxy: { '/api': 'http://127.0.0.1:8080' } },
});
