# @emfts/uimodel-vega

Vega-Lite-Charts für [`@emfts/uimodel-composer`](../uimodel-composer).

Eigenes EPackage (`http://uimodel/vega/1.0`), dessen Klassen per href von
`Component` des Core-UIModels erben — das Core-Metamodell bleibt unverändert.

```bash
npm install @emfts/uimodel-vega @emfts/uimodel-composer vega-embed vue
```

## Verwendung

```ts
// 1. EPackage NACH dem Core-UIModel registrieren (_init() liest Component
//    aus der EPackageRegistry) — daher dynamischer Import:
const { UimodelVegaPackage, UimodelVegaFactory } = await import('@emfts/uimodel-vega');
const pkg = UimodelVegaPackage.eINSTANCE;
pkg.setEFactoryInstance(UimodelVegaFactory.eINSTANCE);
EPackageRegistry.INSTANCE.set(pkg.getNsURI()!, pkg);

// 2. Renderer der ComposerRegistry beisteuern
import { VegaViewComposer } from '@emfts/uimodel-vega';
const registry = createComposerRegistry({ ...defaults, VegaView: VegaViewComposer });
```

Modell und Attribute: [`model/uimodel-vega.ecore`](model/uimodel-vega.ecore),
Hintergrund in [requirements_vega.md](requirements_vega.md).

## Lizenz

EPL-2.0
