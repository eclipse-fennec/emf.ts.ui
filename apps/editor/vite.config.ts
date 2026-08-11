import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootModules = path.resolve(__dirname, '../../node_modules');

export default defineConfig({
  plugins: [
    vue(),
    nodePolyfills(), // stream, buffer, etc. für @emfts/core XMI-Parser
  ],
  resolve: {
    // Genau eine Instanz je Laufzeit-Bibliothek: @emfts/command hängt per
    // file:-Verweis eine eigene @emfts/core-Kopie mit — aus deren
    // node_modules ist der Polyfill-Shim nicht auflösbar, und zwei
    // EPackageRegistry-Instanzen würden das Modell-Laden brechen.
    dedupe: ['vue', '@emfts/core', '@emfts/vue-registry'],
    alias: {
      '@emfts/core': path.join(rootModules, '@emfts/core'),
      '@emfts/vue-registry': path.join(rootModules, '@emfts/vue-registry'),
    },
  },
});
