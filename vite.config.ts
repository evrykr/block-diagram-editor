import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5188,
    watch: {
      ignored: [
        '**/__tests__/**',
        '**/*.tmpdir/**',
        '**/scripts/**',
        '**/.edge-profile/**',
      ],
    },
  },
});
