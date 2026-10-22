import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue';
import type { EObject, EStructuralFeature } from '@emfts/core';
import type { WidgetComponent } from '../generated/WidgetComponent';
import { resolveStyleList } from '../utils/resolveStyleChain';
import { resolveBindings } from '../utils/resolveBindings';
import { trackExpressionTick } from '../utils/reactivity';
import { isSet } from '../utils/isSet';
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
 */
export function useWidgetConfig(
  widget: MaybeRefOrGetter<WidgetComponent>,
  model?: MaybeRefOrGetter<EObject | undefined>
): ComputedRef<WidgetConfig> {
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
    if (!m || (w.bindings?.length ?? 0) === 0) {
      return { ...fromStyles, ...statics };
    }

    const bindings = resolveBindings(w, m);
    return {
      ...fromStyles,
      ...statics,
      ...bindings.values,
      boundFeature: bindings.feature,
      featureSuppressed: bindings.featureSuppressed,
    };
  });
}
