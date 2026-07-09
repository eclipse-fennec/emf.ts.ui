# @emfts/uimodel-composer

UIModel-getriebener Vue-3-Composer für [EMF.ts](https://github.com/eclipse-fennec/emf.ts)-Modelle.

Statt UIs von Hand zu bauen, wird die Oberfläche als **UIModel** (Ecore/XMI) beschrieben und zur
Laufzeit interpretiert: Der `UIModelComposer` rendert aus einem geladenen UIModel und einem
Domänen-`EObject` reaktiv die passende Vue-Komponenten-Hierarchie.

## Features

- **View-Typen**: `FormView`, `SectionView`, `TabView`, `TableView`, `SummaryView`, `MasterDetail`
- **Widgets**: Input, TextArea, Number, Checkbox, Date, Combobox, Select, ReferenceLink —
  Rendering über die `@emfts/vue-registry` (eigene Widgets pro EDataType registrierbar)
- **Styles**: kaskadierende Style-Ketten (`BaseStyle`, `LayoutStyle`, `WidgetStyle`, `TableStyle`)
  mit `resolveStyleChain`
- **Expressions**: Sichtbarkeit und Validierung modellgetrieben via JS- oder OCL-Ausdrücken
  (`registerOclEvaluator` für einen OCL-Adapter, z. B. `@emfts/ocl.langium`)
- **Validierung**: `ValidationExpression` + `ValidationMessageMapper` mit Severities
- **Erweiterungen** als separate EPackages, die das Core-UIModel nicht verändern:
  - **Vega** (`http://uimodel/vega/1.0`): Charts via Vega-Lite (`VegaViewComposer`),
    siehe [requirements_vega.md](requirements_vega.md)
  - **Maps** (`http://uimodel/maps/1.0`, QGIS-orientiert): Karten via OpenLayers (`MapViewComposer`)

## Installation

```bash
npm install @emfts/uimodel-composer @emfts/core @emfts/vue-registry vue
```

Für die Erweiterungen zusätzlich: `vega`, `vega-embed`, `vega-lite` (Vega) bzw. `ol` (Maps).

## Quick Start

```ts
import { createApp } from 'vue';
import { EmftsRendererPlugin, componentRegistry } from '@emfts/vue-registry';
import { registerEcorePackage, EPackageRegistry } from '@emfts/core';
import { UimodelPackage, UimodelFactory } from '@emfts/uimodel-composer';

// 1. Packages registrieren (Ecore-Basis, UIModel, eigene Domänen-Packages)
registerEcorePackage();
const uimodel = UimodelPackage.eINSTANCE;
uimodel.setEFactoryInstance(UimodelFactory.eINSTANCE);
EPackageRegistry.INSTANCE.set(uimodel.getNsURI()!, uimodel);

// 2. UIModel- und Domänen-XMI über ein ResourceSet laden, dann App mounten
const app = createApp(App, { uiModel, model });
app.use(EmftsRendererPlugin, { registry: componentRegistry });
app.mount('#app');
```

```vue
<template>
  <UIModelComposer :ui-model="uiModel" :model="model" />
</template>

<script setup lang="ts">
import { UIModelComposer, type UIModel } from '@emfts/uimodel-composer';
import type { EObject } from '@emfts/core';

defineProps<{ uiModel: UIModel; model: EObject }>();
</script>
```

**Wichtig bei den Erweiterungen:** `@emfts/uimodel-composer/vega` und
`@emfts/uimodel-composer/maps` erst **nach** der Registrierung des Core-UIModels dynamisch
importieren — deren Package-Initialisierung liest `Component` aus der `EPackageRegistry`.

Ein vollständiges, lauffähiges Setup (XMI-Loading, OCL-Adapter, eigene Widgets) zeigt die
Example-App unter [`example/`](example/).

## Modell & Codegen

Die TypeScript-Klassen unter `src/generated/` werden **nicht von Hand gepflegt**, sondern mit
`@emfts/codegen` aus den Ecore-Modellen unter [`model/`](model/) generiert:

```bash
npm run generate        # Core-UIModel   (model/uimodel.ecore)
npm run generate:vega   # Vega-Extension (model/uimodel-vega.ecore)
npm run generate:maps   # Maps-Extension (model/uimodel-maps.ecore)
```

Änderungen am Metamodell immer im `.ecore` vornehmen und anschließend neu generieren.

## Example-App

```bash
npm install && npm run build   # Library bauen (example nutzt file:../)
cd example
npm install
npm run dev
```

Die Example-App demonstriert Formulare, Tabellen, Master-Detail, Vega-Charts und
OpenLayers-Karten auf Basis eigener Domänen-Modelle (`example/model/`).

## Entwicklung

```bash
npm run build        # vue-tsc --noEmit && vite build
npm run type-check   # nur Typprüfung
npm test             # vitest (watch)
npm run test:run     # vitest einmalig
```

## Lizenz

[EPL-2.0](https://www.eclipse.org/legal/epl-2.0/)
