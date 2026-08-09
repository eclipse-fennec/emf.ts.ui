/**
 * PropertyBinding-Auflösung (Issue #3): wertet WidgetComponent.bindings
 * gegen das Domänenobjekt aus und liefert die gebundenen Parameterwerte.
 *
 * Auflösungs-Reihenfolge (vom Aufrufer umgesetzt, i. d. R. useWidgetConfig):
 *   Binding-Ergebnis > statischer Wert am Widget > Ableitung.
 *
 * Koersion (dokumentiert, B-Typen): boolesche Parameter → Boolean(result),
 * numerische → Number(result), Sonderfall "feature" → Wert unverändert
 * (EStructuralFeature oder null; null ⇒ Widget nicht rendern), sonst
 * String(result). undefined-Ergebnisse (fail-open) werden übersprungen.
 */
import type { EObject, EStructuralFeature } from '@emfts/core';
import type { WidgetComponent } from '../generated/WidgetComponent';
import { evaluateValue } from './evaluateExpression';

const BOOLEAN_PROPS = new Set([
  'readOnly', 'required', 'password', 'asToggle', 'multiSelect',
  'asButtonGroup', 'withTime',
]);

const NUMBER_PROPS = new Set([
  'maxLength', 'rows', 'min', 'max', 'step', 'minSearchLength', 'order',
]);

function coerce(property: string, value: unknown): unknown {
  if (value === null) return property === 'feature' ? null : undefined;
  if (property === 'feature') return value;
  if (BOOLEAN_PROPS.has(property)) return Boolean(value);
  if (NUMBER_PROPS.has(property)) {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return String(value);
}

export interface ResolvedBindings {
  /** Gebundene Parameterwerte (nur definierte Ergebnisse). */
  values: Record<string, unknown>;
  /** true, wenn ein feature-Binding existiert und null ergab. */
  featureSuppressed: boolean;
  /** Ergebnis eines feature-Bindings (falls vorhanden und nicht null). */
  feature?: EStructuralFeature;
}

/** Wertet alle Bindings eines Widgets aus. */
export function resolveBindings(
  widget: WidgetComponent,
  model: EObject
): ResolvedBindings {
  const result: ResolvedBindings = { values: {}, featureSuppressed: false };
  for (const binding of widget.bindings ?? []) {
    const property = binding.property;
    if (!property || !binding.expression) continue;
    const raw = evaluateValue(binding.expression, model, {
      feature: widget.feature,
      eClass: model.eClass?.(),
    });
    if (raw === undefined) continue; // fail-open → statischer Wert gilt

    if (property === 'feature') {
      if (raw === null) {
        result.featureSuppressed = true;
      } else {
        result.feature = raw as EStructuralFeature;
      }
      continue;
    }

    const value = coerce(property, raw);
    if (value !== undefined) result.values[property] = value;
  }
  return result;
}
