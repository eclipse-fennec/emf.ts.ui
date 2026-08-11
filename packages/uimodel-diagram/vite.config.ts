import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    vue(),
    dts({ insertTypesEntry: true, include: ['src/**/*.ts', 'src/**/*.vue'] }),
  ],
  build: {
    lib: {
      entry: { index: resolve(__dirname, 'src/index.ts') },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        'vue',
        '@emfts/core',
        '@emfts/uimodel-composer',
        '@emfts/tsrouter',
        'elkjs/lib/elk.bundled.js',
        '@eclipse-daanse/tsm',
      ],
      output: { preserveModules: true, preserveModulesRoot: 'src' },
    },
  },
});
