import { createApp } from 'vue';
import '@emfts/uimodel-composer/style.css';
import App from './App.vue';
import { EmftsRendererPlugin, componentRegistry } from '@emfts/vue-registry';
import StringFieldWidget from './components/StringFieldWidget.vue';
import { loadResources } from './emf/loadResources';

// EString-Features → eigenes StringFieldWidget (überschreibt Default)
componentRegistry.registerForDataType('EString', StringFieldWidget);

// Ressourcen laden, dann App mounten
loadResources()
  .then(({ uiModel, chartModel, mapModel, transitMapModel, transitNetwork, persons, dataset, diagramModel, ecoreDomain }) => {
    const app = createApp(App, { uiModel, chartModel, mapModel, transitMapModel, transitNetwork, persons, dataset, diagramModel, ecoreDomain });
    // Plugin registriert componentRegistry via provide() — nötig für useComponentRegistry()
    app.use(EmftsRendererPlugin, { registerDefaults: false, registry: componentRegistry });
    app.mount('#app');
  })
  .catch((err) => {
    console.error('Fehler beim Laden der Modelle:', err);
    document.body.innerHTML = `<pre style="color:red;padding:2rem">${err}</pre>`;
  });
