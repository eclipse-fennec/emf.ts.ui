import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [
    vue(),
    nodePolyfills(), // stream, buffer, etc. für @emfts/core XMI-Parser
  ],
  resolve: {
    // dist der Library und Editor-Code müssen dieselben Instanzen von
    // vue/@emfts/* sehen (provide/inject-Keys, EPackageRegistry).
    dedupe: ['vue', '@emfts/core', '@emfts/vue-registry'],
    alias: {
      // vite-plugin-node-polyfills ist nur in editor/node_modules,
      // aber @emfts/core liegt in uimodel-composer/node_modules und
      // kann den shim nicht selbst finden → expliziter Alias nötig.
      'vite-plugin-node-polyfills/shims/buffer': path.resolve(
        __dirname,
        'node_modules/vite-plugin-node-polyfills/shims/buffer/dist/index.js',
      ),
      'vite-plugin-node-polyfills/shims/global': path.resolve(
        __dirname,
        'node_modules/vite-plugin-node-polyfills/shims/global/dist/index.js',
      ),
      'vite-plugin-node-polyfills/shims/process': path.resolve(
        __dirname,
        'node_modules/vite-plugin-node-polyfills/shims/process/dist/index.js',
      ),
    },
  },
});
