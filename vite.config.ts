import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react(), {
    name: 'exclude-local-deployment',
    closeBundle() {
      const localManifest = resolve('dist/deployment.local.json');
      if (existsSync(localManifest)) unlinkSync(localManifest);
    },
  }],
  build: { chunkSizeWarningLimit: 1400 },
});
