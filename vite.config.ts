import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    vue(),
    dts({
      insertTypesEntry: true,
      include: ['src/**/*.ts', 'src/**/*.vue'],
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'diagram/index': resolve(__dirname, 'src/diagram/index.ts'),
        'css/index': resolve(__dirname, 'src/css/index.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: ['vue', '@emfts/core', '@emfts/vue-registry', /^ol(\/.*)?$/, 'elkjs/lib/elk.bundled.js', 'tsrouter', '@eclipse-daanse/tsm'],
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
      },
    },
  },
});
