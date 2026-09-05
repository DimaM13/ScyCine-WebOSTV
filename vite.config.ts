import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  plugins: [
    legacy({
      targets: ['chrome >= 38'],
      renderModernChunks: false
    })
  ],
  base: './', // Crucial for LG webOS IPK local file packaging
  server: {
    port: 5175,
    host: true
  },
  build: {
    target: 'chrome38',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    emptyOutDir: true
  }
});
