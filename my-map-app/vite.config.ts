import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import path from 'path'; // Needed for proper aliases

export default defineConfig({
  plugins: [react(), ],
  build: {
    outDir: 'dist',
    sourcemap: false, // disable for production
    rollupOptions: { // Added for better asset handling
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
  },
  esbuild: {
    tsconfigRaw: '{}',
  },
  resolve: {
    alias: {
      '@assets': path.resolve(__dirname, './src/assets'), // More reliable path resolution
      // Add other aliases you might need:
      
    },
  },
});