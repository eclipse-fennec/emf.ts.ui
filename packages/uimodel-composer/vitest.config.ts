import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    // Komponententests (GroupComposer u. a.) brauchen ein DOM; die
    // reinen Logik-Tests laufen unverändert.
    environment: 'jsdom',
  },
});
