/**
 * Maps-Erweiterung für @emfts/uimodel-composer (nsURI http://uimodel/maps/1.0,
 * QGIS-orientiert, Rendering über OpenLayers).
 *
 * Registrierung IMMER nach dem Core-UIModel — UimodelMapsPackage._init()
 * liest Component/Expression aus der EPackageRegistry:
 *
 *   const { UimodelMapsPackage, UimodelMapsFactory } = await import('@emfts/uimodel-maps');
 *   const pkg = UimodelMapsPackage.eINSTANCE;
 *   pkg.setEFactoryInstance(UimodelMapsFactory.eINSTANCE);
 *   EPackageRegistry.INSTANCE.set(pkg.getNsURI()!, pkg);
 *
 * Renderer der ComposerRegistry beisteuern und 'ol/ol.css' importieren:
 *
 *   createComposerRegistry({ ...defaults, MapView: MapViewComposer })
 */
export { default as MapViewComposer } from './MapViewComposer.vue';
export { useMapSelection, MAP_SELECTION_KEY } from './useMapSelection';
export type { MapSelectionHandler } from './useMapSelection';

// Package, Factory, Interfaces und Enums des Maps-EPackage
export * from './generated';
