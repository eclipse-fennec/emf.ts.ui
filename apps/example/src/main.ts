import { createApp } from 'vue';
import '@emfts/uimodel-composer/style.css';
// Ohne das bliebe das Diagramm-SVG bei seiner Standardgröße von 300×150.
import '@emfts/uimodel-diagram/style.css';
import App from './App.vue';
import { EmftsRendererPlugin, componentRegistry } from '@emfts/vue-registry';
import StringFieldWidget from './components/StringFieldWidget.vue';
import { loadResources } from './emf/loadResources';

// EString-Features → eigenes StringFieldWidget (überschreibt Default)
componentRegistry.registerForDataType('EString', StringFieldWidget);

// Ressourcen laden, dann App mounten
loadResources()
  .then((loaded) => {
    const app = createApp(App, { ...loaded });
    // Plugin registriert componentRegistry via provide() — nötig für useComponentRegistry()
    app.use(EmftsRendererPlugin, { registerDefaults: false, registry: componentRegistry });
    app.mount('#app');
  })
  .catch((err) => {
    console.error('Fehler beim Laden der Modelle:', err);
    document.body.innerHTML = `<pre style="color:red;padding:2rem">${err}</pre>`;
  });
