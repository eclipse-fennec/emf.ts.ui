/**
 * Diagramm-Erweiterung für @emfts/uimodel-composer
 * (nsURI http://uimodel/diagram/1.0, ELK-Layout, orthogonales Routing, SVG).
 *
 * Registrierung IMMER nach dem Core-UIModel — UimodelDiagramPackage._init()
 * liest Component/Expression aus der EPackageRegistry:
 *
 *   const { UimodelDiagramPackage, UimodelDiagramFactory } = await import('@emfts/uimodel-diagram');
 *   const pkg = UimodelDiagramPackage.eINSTANCE;
 *   pkg.setEFactoryInstance(UimodelDiagramFactory.eINSTANCE);
 *   EPackageRegistry.INSTANCE.set(pkg.getNsURI()!, pkg);
 *
 * Renderer der ComposerRegistry beisteuern:
 *
 *   createComposerRegistry({ ...defaults, DiagramView: DiagramViewComposer })
 */
import type { ModuleContext, ModuleLifecycle } from '@eclipse-daanse/tsm'
import DiagramViewComposer from './DiagramViewComposer.vue'

export { default as DiagramViewComposer } from './DiagramViewComposer.vue'
export { useDiagramSelection, DIAGRAM_SELECTION_KEY } from './useDiagramSelection'
export type { DiagramSelectionHandler } from './useDiagramSelection'

// Projektion und Symbologie — auch ohne Vue nutzbar (Tests, eigene Renderer)
export { interpret, resolveNodeView, layoutNode, nodeSymbolOf } from './interpret'
export type { InterpretResult, NodeRef, EdgeMeta, NodeView, RowView, LayoutItem } from './interpret'
export {
  resolveNodeSymbol,
  resolveFrameSymbol,
  resolveEdgeSymbol,
  measureSymbolNode,
  shapePath,
  dashArray,
  COMPARTMENT_SYMBOL,
  DEFAULT_SYMBOL,
  FRAME_SYMBOL,
  DEFAULT_EDGE_SYMBOL,
} from './symbology'
export type {
  SymbolView,
  SymbolBox,
  EdgeSymbolView,
  ShapeName,
  LineStyleName,
  LabelPlacementName,
} from './symbology'
export { Grouper } from './grouping'
export type { FrameRef } from './grouping'

// Package, Factory, Interfaces und Enums des Diagramm-EPackage
export * from './generated'

export const activate = (context: ModuleContext): void => {
  context.log.info('uimodel-diagram activated')
  context.services.register('uimodel-diagram.composer', DiagramViewComposer)
}

export const deactivate = (context: ModuleContext): void => {
  context.log.info('uimodel-diagram deactivated')
  context.services.unregister('uimodel-diagram.composer')
}

export default { activate, deactivate } satisfies ModuleLifecycle
