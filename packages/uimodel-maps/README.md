# @emfts/uimodel-maps

Karten (OpenLayers, QGIS-orientiert) für [`@emfts/uimodel-composer`](../uimodel-composer).

Eigenes EPackage (`http://uimodel/maps/1.0`) mit Layer-Baum, Symbology und
Klick-Bindings zurück ins EMF-Modell; die Klassen erben per href von
`Component` des Core-UIModels.

```bash
npm install @emfts/uimodel-maps @emfts/uimodel-composer ol vue
```

## Verwendung

```ts
// 1. EPackage NACH dem Core-UIModel registrieren
const { UimodelMapsPackage, UimodelMapsFactory } = await import('@emfts/uimodel-maps');
const pkg = UimodelMapsPackage.eINSTANCE;
pkg.setEFactoryInstance(UimodelMapsFactory.eINSTANCE);
EPackageRegistry.INSTANCE.set(pkg.getNsURI()!, pkg);

// 2. Renderer registrieren, OpenLayers-CSS einbinden
import { MapViewComposer, MAP_SELECTION_KEY } from '@emfts/uimodel-maps';
import 'ol/ol.css';
const registry = createComposerRegistry({ ...defaults, MapView: MapViewComposer });
```

Klick-Selektion: einen Handler über `MAP_SELECTION_KEY` bereitstellen
(`provide(MAP_SELECTION_KEY, (feature) => …)`).

Modell: [`model/uimodel-maps.ecore`](model/uimodel-maps.ecore).

## Lizenz

EPL-2.0
