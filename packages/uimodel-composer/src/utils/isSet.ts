import type { EObject } from '@emfts/core';

/**
 * true, wenn das Feature `name` am Objekt gesetzt ist (eIsSet).
 *
 * Seit @emfts/codegen 0.0.2 starten Attribute mit ihrem Metamodell-Default
 * (EBoolean false, EInt 0, EEnum erstes Literal) statt mit undefined —
 * "gesetzt" lässt sich daher nicht mehr per `!== undefined` erkennen.
 * Für Kaskaden (Style-Kette, Widget > Style, Block > Widget) sind die
 * betroffenen Attribute im Ecore unsettable, damit auch ein explizit
 * gesetzter Default-Wert (readOnly=false, layout=VERTICAL) als gesetzt gilt.
 */
export function isSet(obj: EObject, name: string): boolean {
  const feature = obj.eClass().getEStructuralFeature(name);
  return feature != null && obj.eIsSet(feature);
}
