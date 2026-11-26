/**
 * Strukturelle Platzhalter (Issue #6): purer Kern, der eine fields-Liste
 * gegen ein Domänenobjekt zu einer flachen Render-Liste auflöst.
 *
 *   AllFeatures  → expandFeatures (Auswahl/Widget-Wahl, #2/#5)
 *   Conditional  → then/else nach condition (self = Domänenobjekt,
 *                  fail-open wie visibility), rekursiv aufgelöst
 *   ForEach      → items-Expression → pro Element wird body mit
 *                  model = Element aufgelöst; leer + emptyText ⇒ Note
 *   GroupWidget  → bleibt als Container-Eintrag stehen (der Renderer
 *                  rekurriert über seine fields mit dem Entry-Model)
 *   ListWidget   → Liste eines mehrwertigen Attributs (#24)
 *   SubFormWidget→ Unterformular einer Containment-Referenz (#25)
 *   sonst        → normales Widget
 */
import type { EClass, EObject } from '@emfts/core';
import type { WidgetComponent } from '../generated/WidgetComponent';
import type { Conditional } from '../generated/Conditional';
import type { ForEach } from '../generated/ForEach';
import type { GroupWidget } from '../generated/GroupWidget';
import type { ListWidget } from '../generated/ListWidget';
import type { SubFormWidget } from '../generated/SubFormWidget';
import {
  expandFeatures,
  isAllFeatures,
  type ExpansionContext,
} from './expandFeatures';
import { evaluateBoolean, evaluateValue } from '../utils/evaluateExpression';

export type ResolvedEntry =
  | { kind: 'widget'; widget: WidgetComponent; model: EObject }
  | { kind: 'group'; widget: GroupWidget; model: EObject }
  | { kind: 'list'; widget: ListWidget; model: EObject }
  | { kind: 'subform'; widget: SubFormWidget; model: EObject }
  | { kind: 'note'; text: string; owner: EObject };

function eclassName(obj: EObject): string {
  return obj.eClass?.()?.getName?.() ?? '';
}

export function isGroupWidget(obj: EObject): obj is GroupWidget {
  return eclassName(obj) === 'GroupWidget';
}

export function isListWidget(obj: EObject): obj is ListWidget {
  return eclassName(obj) === 'ListWidget';
}

export function isSubFormWidget(obj: EObject): obj is SubFormWidget {
  return eclassName(obj) === 'SubFormWidget';
}

export function isConditional(obj: EObject): obj is Conditional {
  return eclassName(obj) === 'Conditional';
}

export function isForEach(obj: EObject): obj is ForEach {
  return eclassName(obj) === 'ForEach';
}

/** true für Platzhalter, die selbst kein Widget rendern. */
export function isStructural(obj: EObject): boolean {
  return isAllFeatures(obj) || isConditional(obj) || isForEach(obj);
}

function toEObjects(value: unknown): EObject[] {
  if (!value) return [];
  const iterable =
    typeof value === 'object' && Symbol.iterator in (value as object)
      ? (value as Iterable<unknown>)
      : [value];
  const result: EObject[] = [];
  for (const item of iterable) {
    if (item && typeof (item as EObject).eClass === 'function') {
      result.push(item as EObject);
    } else if (item !== null && item !== undefined) {
      console.warn('[uimodel-composer] ForEach: Element ist kein EObject und wird übersprungen:', item);
    }
  }
  return result;
}

/**
 * Der Eintrag zu einem fertigen Widget — die Klasse entscheidet, wer es
 * rendert. Gilt auch für Widgets **aus der Expansion**: Ein Prototyp
 * kann eine Gruppe, eine Liste oder ein Unterformular sein, und ein
 * Klon davon ist es ebenso.
 */
function entryFor(widget: WidgetComponent, model: EObject): ResolvedEntry {
  if (isGroupWidget(widget)) return { kind: 'group', widget, model };
  if (isListWidget(widget)) return { kind: 'list', widget, model };
  if (isSubFormWidget(widget)) return { kind: 'subform', widget, model };
  return { kind: 'widget', widget, model };
}

/** Löst eine fields-Liste rekursiv zu einer flachen Render-Liste auf. */
export function resolveStructure(
  fields: Iterable<WidgetComponent> | undefined,
  model: EObject,
  context?: ExpansionContext
): ResolvedEntry[] {
  const entries: ResolvedEntry[] = [];
  for (const field of fields ?? []) {
    if (isAllFeatures(field)) {
      const eClass = model.eClass?.() as EClass | undefined;
      if (!eClass) continue;
      for (const widget of expandFeatures(eClass, field, context)) {
        entries.push(entryFor(widget, model));
      }
    } else if (isConditional(field)) {
      const branch = evaluateBoolean(field.condition, model) ? field.then : field.else;
      entries.push(...resolveStructure(branch, model, context));
    } else if (isForEach(field)) {
      const items = toEObjects(evaluateValue(field.items, model));
      if (items.length === 0) {
        if (field.emptyText) entries.push({ kind: 'note', text: field.emptyText, owner: field });
        continue;
      }
      for (const item of items) {
        entries.push(...resolveStructure(field.body, item, context));
      }
    } else {
      entries.push(entryFor(field, model));
    }
  }
  return entries;
}
