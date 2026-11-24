import { inject, type InjectionKey } from 'vue'
import type { EObject } from '@emfts/core'

/**
 * Wird vom DiagramViewComposer beim Klick auf einen Knoten gerufen, zusätzlich
 * zum Schreiben der DiagramSelectionBindings ins EMF-Modell. Damit kann ein
 * Vue-Vorfahr auf die Auswahl reagieren, etwa ein Detail-Panel füllen.
 *
 * Das Gegenstück zu useMapSelection in @emfts/uimodel-maps.
 *
 * @param node      Das EObject des geklickten Knotens (undefined beim Klick ins Leere).
 * @param component Das DiagramView-EObject.
 */
export type DiagramSelectionHandler = (
  node: EObject | undefined,
  component: EObject,
) => void

export const DIAGRAM_SELECTION_KEY: InjectionKey<DiagramSelectionHandler> =
  Symbol('uimodelDiagramSelection')

/** Den vom Vorfahren bereitgestellten Auswahl-Handler holen, falls vorhanden. */
export function useDiagramSelection(): DiagramSelectionHandler | null {
  return inject<DiagramSelectionHandler | null>(DIAGRAM_SELECTION_KEY, null)
}
