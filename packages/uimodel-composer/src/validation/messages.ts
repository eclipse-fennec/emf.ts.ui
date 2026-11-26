/**
 * Validierungsmeldungen und ihre Mapper
 * ([Issue #20](https://github.com/eclipse-fennec/emf.ts.ui/issues/20)).
 *
 * `ValidationMessageMapper` steht seit je im Metamodell, ausgewertet hat
 * ihn niemand. Ein Mapper trifft, wenn **alle** gesetzten match-Felder
 * zutreffen, und überschreibt dann **nur** seine gesetzten mapped-Felder;
 * alle treffenden Mapper werden der Reihe nach (`order` aufsteigend)
 * kaskadierend angewendet.
 */
import type { EObject } from '@emfts/core';
import type { ValidationMessageMapper } from '../generated/ValidationMessageMapper';
import type { ValidationExpression } from '../generated/ValidationExpression';
import { evaluateBoolean, evaluateValue } from '../utils/evaluateExpression';
import { isSet } from '../utils/isSet';

export type Severity = 'INFO' | 'WARNING' | 'ERROR' | 'FATAL';

/** Eine Meldung, wie sie Felder und Formular liefern. */
export interface ValidationMessage {
  /** Angezeigter Text (bereits übersetzt). */
  message: string;
  severity: Severity;
  /** Feld oder Formular — woher die Meldung stammt. */
  source: 'field' | 'form';
  /** Fachlicher Code, falls der Erzeuger einen mitgibt (z. B. ein Backend). */
  code?: string;
  /** Name des betroffenen Features, falls die Meldung an einem Feld hängt. */
  featureName?: string;
}

/** Mapper nach `order` aufsteigend; ohne `order` gilt 0. */
function byOrder(mappers: Iterable<ValidationMessageMapper>): ValidationMessageMapper[] {
  return [...mappers].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
}

/** Trifft der Mapper auf die Meldung zu? Nur gesetzte Felder zählen (AND). */
function matches(
  mapper: ValidationMessageMapper,
  message: ValidationMessage,
  model: EObject
): boolean {
  if (mapper.matchCode && mapper.matchCode !== message.code) return false;

  const mapperObject = mapper as unknown as EObject;
  if (isSet(mapperObject, 'matchSeverity') && mapper.matchSeverity !== message.severity) {
    return false;
  }

  if (mapper.matchExpression) {
    try {
      // Kontext der Match-Expression ist die Meldung selbst, `model` bleibt
      // als `self` erreichbar — so kann sie beides prüfen.
      const result = evaluateBoolean(
        mapper.matchExpression as unknown as ValidationExpression,
        model,
        { message }
      );
      if (!result) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Wendet die treffenden Mapper kaskadierend an.
 *
 * @param translate Übersetzer für `mappedText` (LocalizedEString).
 */
export function applyMappers(
  message: ValidationMessage,
  mappers: Iterable<ValidationMessageMapper> | undefined,
  model: EObject,
  translate?: (text: string | undefined, owner: EObject) => string | undefined
): ValidationMessage {
  if (!mappers) return message;
  let current = message;
  for (const mapper of byOrder(mappers)) {
    if (!matches(mapper, current, model)) continue;

    let text: string | undefined;
    if (mapper.mappedText) {
      // statischer Text hat Vorrang vor der Expression
      text = translate
        ? translate(mapper.mappedText, mapper as unknown as EObject)
        : mapper.mappedText;
    } else if (mapper.mappedTextExpression) {
      try {
        const value = evaluateValue(
          mapper.mappedTextExpression as unknown as ValidationExpression,
          model,
          { message: current }
        );
        if (value !== undefined && value !== null) text = String(value);
      } catch {
        // fail-open: Text bleibt wie er war
      }
    }

    const mapperObject = mapper as unknown as EObject;
    current = {
      ...current,
      ...(text !== undefined ? { message: text } : {}),
      ...(isSet(mapperObject, 'mappedSeverity')
        ? { severity: mapper.mappedSeverity as Severity }
        : {}),
    };
  }
  return current;
}
