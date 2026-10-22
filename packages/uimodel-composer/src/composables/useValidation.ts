import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue';
import type { EObject, EStructuralFeature } from '@emfts/core';
import type { ValidationExpression } from '../generated/ValidationExpression';
import { evaluateBoolean } from '../utils/evaluateExpression';
import { trackExpressionTick } from '../utils/reactivity';
import { MESSAGE_KEYS, useTranslate } from '../i18n/translate';

export type Severity = 'INFO' | 'WARNING' | 'ERROR' | 'FATAL';

export interface ValidationResult {
  valid: boolean;
  message: string;
  severity: Severity;
}

export interface ValidationOptions {
  /** Angezeigtes Label des Feldes; füllt {label} in Meldungen. */
  label?: MaybeRefOrGetter<string | undefined>;
  /** Gebundenes Feature, für den Übersetzer-Kontext. */
  feature?: MaybeRefOrGetter<EStructuralFeature | undefined>;
}

/**
 * Evaluates a list of ValidationExpressions against a domain EObject.
 * Returns the first failing validation, or null if all pass.
 * defaultMessage (LocalizedEString) läuft durch den Übersetzer
 * (Issue #13); Composer-Keys haben eingebaute deutsche Texte.
 */
export function useValidation(
  validations: MaybeRefOrGetter<Iterable<ValidationExpression>>,
  context: MaybeRefOrGetter<EObject>,
  options: ValidationOptions = {}
): ComputedRef<ValidationResult | null> {
  const translate = useTranslate();
  return computed(() => {
    trackExpressionTick();
    const ctx = toValue(context);
    for (const v of toValue(validations)) {
      try {
        const passes = evaluateBoolean(v, ctx);
        if (!passes) {
          const label = toValue(options.label);
          const message = translate(v.defaultMessage || MESSAGE_KEYS.invalid, {
            kind: 'message',
            owner: v,
            feature: toValue(options.feature),
            params: label ? { label } : undefined,
          });
          return {
            valid: false,
            message: message ?? '',
            severity: (v.severity as Severity | undefined) ?? 'ERROR',
          };
        }
      } catch {
        // evaluation error → treat as valid (fail-open)
      }
    }
    return null;
  });
}
