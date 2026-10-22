import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue';
import type { EObject, EStructuralFeature } from '@emfts/core';
import type { WidgetComponent } from '../generated/WidgetComponent';
import { resolveStyleList } from '../utils/resolveStyleChain';
import { resolveBindings } from '../utils/resolveBindings';
import { trackExpressionTick } from '../utils/reactivity';
import { isSet } from '../utils/isSet';
import { useTranslate } from '../i18n/translate';
import type { ResolvedStyle } from '../types/ResolvedStyle';

/** ResolvedStyle plus feature-Binding-Ergebnis (Issue #3). */
export interface WidgetConfig extends ResolvedStyle {
  /** Ergebnis eines feature-Bindings (überschreibt widget.feature). */
  boundFeature?: EStructuralFeature;
  /** true → feature-Binding ergab null, Widget nicht rendern. */
  featureSuppressed?: boolean;
}

/**
 * Resolves the effective display configuration for a WidgetComponent.
 * Auflösungs-Reihenfolge: PropertyBindings > direkte Widget-Attribute >
 * Style-Kette (resolveStyleList). Bindings werden nur ausgewertet, wenn
 * ein Domänenobjekt übergeben wird (reaktiv zur Renderzeit).
 * label/placeholder aus Widget und Style-Kette (LocalizedEString) laufen
 * durch den Übersetzer (Issue #13); Binding-Ergebnisse sind berechnet
 * und bleiben unverändert.
 */
export function useWidgetConfig(
  widget: MaybeRefOrGetter<WidgetComponent>,
  model?: MaybeRefOrGetter<EObject | undefined>
): ComputedRef<WidgetConfig> {
  const translate = useTranslate();
  return computed(() => {
    trackExpressionTick();
    const w = toValue(widget);
    const fromStyles = resolveStyleList(w.styles);

    // Direct widget attributes take precedence over style chain
    const statics: Partial<ResolvedStyle> = {
      ...(isSet(w, 'label') ? { label: w.label } : {}),
      ...(isSet(w, 'placeholder') ? { placeholder: w.placeholder } : {}),
      ...(isSet(w, 'readOnly') ? { readOnly: w.readOnly } : {}),
      ...(isSet(w, 'required') ? { required: w.required } : {}),
    };

    const m = model ? toValue(model) : undefined;
    const bindings = m && w.bindings.length > 0 ? resolveBindings(w, m) : undefined;

    const resolved: WidgetConfig = { ...fromStyles, ...statics };
    const feature = bindings?.feature ?? w.feature;
    if (resolved.label !== undefined) {
      resolved.label = translate(resolved.label, { kind: 'label', feature, owner: w });
    }
    if (resolved.placeholder !== undefined) {
      resolved.placeholder = translate(resolved.placeholder, { kind: 'placeholder', feature, owner: w });
    }

    if (!bindings) return resolved;
    return {
      ...resolved,
      ...bindings.values,
      boundFeature: bindings.feature,
      featureSuppressed: bindings.featureSuppressed,
    };
  });
}
