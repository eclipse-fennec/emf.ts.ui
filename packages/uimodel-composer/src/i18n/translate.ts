/**
 * Übersetzbare Texte im UIModel (Issue #13).
 *
 * Attribute vom Typ LocalizedEString (label, placeholder, emptyText,
 * defaultMessage, mappedText, eigene Attribute von Extension-Paketen)
 * tragen einen Übersetzungs-Key oder einen wörtlichen Text. Der Composer
 * reicht den Wert zur Renderzeit durch die translate-Funktion des
 * Konsumenten (UIModelComposer-Prop `translate`). Liefert sie nichts,
 * wird der Wert unverändert angezeigt: wörtliche Texte funktionieren
 * ohne Übersetzer weiter, ein fehlender Key bleibt sichtbar.
 *
 * Das Modell wird dabei nie verändert — der Key bleibt erhalten, ein
 * Sprachwechsel rendert neu (translate ist reaktiv, sofern die Funktion
 * selbst reaktive Quellen liest, z. B. vue-i18n `t`).
 */
import { computed, inject, unref, type ComputedRef, type InjectionKey } from 'vue';
import type { EObject, EStructuralFeature } from '@emfts/core';

/** Woher der Text stammt — für Übersetzer, die je Art unterschiedlich verfahren. */
export type TranslateKind = 'label' | 'placeholder' | 'text' | 'message' | 'hint';

export interface TranslateContext {
  kind: TranslateKind;
  /** Das gebundene Domänen-Feature (Labels/Placeholder/Hints eines Widgets). */
  feature?: EStructuralFeature;
  /** Das Modellobjekt, das den Text trägt (Widget, Style, Validation, …). */
  owner?: EObject;
  /** Platzhalter-Werte für Meldungen, z. B. { label } bei Pflichtfeldern. */
  params?: Record<string, string>;
}

/** Übersetzer des Konsumenten: Key → Text, oder undefined wenn unbekannt. */
export type Translator = (key: string, context: TranslateContext) => string | undefined;

export const TRANSLATOR_KEY: InjectionKey<ComputedRef<Translator | undefined>> =
  Symbol('uimodel:translator');

/** Keys der vom Composer selbst erzeugten Meldungen. */
export const MESSAGE_KEYS = {
  required: 'uimodel.validation.required',
  invalid: 'uimodel.validation.invalid',
} as const;

/** Eingebaute Texte, wenn der Übersetzer einen Composer-Key nicht kennt. */
const BUILTIN_MESSAGES: Record<string, string> = {
  [MESSAGE_KEYS.required]: '{label} ist erforderlich.',
  [MESSAGE_KEYS.invalid]: 'Ungültiger Wert.',
};

const BUILTIN_PARAM_DEFAULTS: Record<string, string> = {
  label: 'Dieses Feld',
};

function interpolate(template: string, params: Record<string, string> | undefined): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    params?.[name] ?? BUILTIN_PARAM_DEFAULTS[name] ?? match
  );
}

/**
 * Übersetzt einen Text mit dem gegebenen Übersetzer. Reihenfolge:
 * Übersetzer → eingebauter Composer-Text → der Wert selbst.
 */
export function translateText(
  translator: Translator | undefined,
  text: string | undefined,
  context: TranslateContext
): string | undefined {
  if (text === undefined || text === null || text === '') return text;
  const translated = translator?.(text, context);
  if (translated !== undefined && translated !== null) return translated;
  const builtin = BUILTIN_MESSAGES[text];
  return builtin !== undefined ? interpolate(builtin, context.params) : text;
}

/** true, wenn das Feature als übersetzbarer Text typisiert ist. */
export function isLocalized(feature: EStructuralFeature | null | undefined): boolean {
  return feature?.getEType?.()?.getName?.() === 'LocalizedEString';
}

/**
 * Übersetzungsfunktion für Composer und eigene Renderer. Ohne
 * bereitgestellten Übersetzer gibt sie Texte unverändert zurück
 * (bzw. die eingebauten Composer-Texte für Composer-Keys).
 */
export function useTranslate(): (text: string | undefined, context: TranslateContext) => string | undefined {
  const translator = inject(TRANSLATOR_KEY, computed(() => undefined));
  return (text, context) => translateText(unref(translator), text, context);
}
