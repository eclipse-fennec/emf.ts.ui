/**
 * Vega-Erweiterung für @emfts/uimodel-composer (nsURI http://uimodel/vega/1.0).
 *
 * Registrierung IMMER nach dem Core-UIModel — UimodelVegaPackage._init()
 * liest Component/Expression aus der EPackageRegistry:
 *
 *   const { UimodelVegaPackage, UimodelVegaFactory } = await import('@emfts/uimodel-vega');
 *   const pkg = UimodelVegaPackage.eINSTANCE;
 *   pkg.setEFactoryInstance(UimodelVegaFactory.eINSTANCE);
 *   EPackageRegistry.INSTANCE.set(pkg.getNsURI()!, pkg);
 *
 * Der Renderer wird der ComposerRegistry beigesteuert:
 *
 *   createComposerRegistry({ ...defaults, VegaView: VegaViewComposer })
 */
export { default as VegaViewComposer } from './VegaViewComposer.vue';

// Package, Factory, Interfaces und Enums des Vega-EPackage
export * from './generated';
