/**
 * Injection-Key für den AllFeatures-Expansionskontext (Dedup pro UIModel).
 * Wird vom UIModelComposer bereitgestellt; der FieldsRenderer injiziert
 * ihn, damit Geschwister-Blöcke und explizit gebundene Widgets bei der
 * Zuordnung berücksichtigt werden.
 */
import type { ComputedRef, InjectionKey } from 'vue';
import type { ExpansionContext } from './expandFeatures';

export const EXPANSION_CONTEXT_KEY: InjectionKey<ComputedRef<ExpansionContext>> =
  Symbol('uimodel:allfeatures-context');
