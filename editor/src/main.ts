import { createApp } from 'vue';
import '../../dist/style.css';
import { EmftsRendererPlugin, componentRegistry } from '@emfts/vue-registry';
import App from './App.vue';
import StringFieldWidget from './components/StringFieldWidget.vue';
import { loadEditorResources } from './emf/loadEditorResources';

// EString-Features → StringFieldWidget (liest UIModel-Label/Styles)
componentRegistry.registerForDataType('EString', StringFieldWidget);

loadEditorResources()
  .then((loaded) => {
    const app = createApp(App, { loaded });
    app.use(EmftsRendererPlugin, { registerDefaults: true, registry: componentRegistry });
    app.mount('#app');
  })
  .catch((err) => {
    console.error('Fehler beim Laden der Modelle:', err);
    document.body.innerHTML = `<pre style="color:red;padding:2rem">${err}</pre>`;
  });
