/**
 * Die Widget-Klasse des UI-Modells als Teil der Komponentenwahl
 * ([Issue #21](https://github.com/eclipse-fennec/emf.ts.ui/issues/21)).
 *
 * `ComponentRegistry.getComponentForFeature` baut den `MatchContext` allein
 * aus dem Feature; die im Modell getroffene Entscheidung (TextAreaWidget
 * statt InputWidget, SelectWidget statt Input, ein Extension-Widget) blieb
 * damit wirkungslos. `buildWidgetMatchContext` legt sie als `custom` dazu,
 * `registerWidgetClass` registriert einen Renderer darauf.
 */
import type { Component } from 'vue';
import type { EClass, EObject, EStructuralFeature } from '@emfts/core';
import { Priority, type ComponentRegistry, type MatchContext, type MatchResult } from '@emfts/vue-registry';
import type { WidgetComponent } from '../generated/WidgetComponent';
import type { ResolvedStyle } from '../types/ResolvedStyle';

/** Name der Widget-EClass, exakt. */
export const WIDGET_CLASS_KEY = 'widgetClass';
/** Name der Widget-EClass und aller ihrer Obertypen, speziellster zuerst. */
export const WIDGET_CLASSES_KEY = 'widgetClasses';

/**
 * Prioritäten der Widget-Wahl. Sie liegt über dem Datentyp (100) — das
 * Modell ist spezifischer als "irgendein EString" —, aber unter einer
 * EClass- (200) oder Feature-Registrierung (300) des Hosts: wer einen
 * Renderer für `Person.name` registriert, meint genau dieses Feld.
 */
export const WIDGET_CLASS_PRIORITY = 150;
/** Widget-Klasse **und** Datentyp getroffen — innerhalb der Widget-Wahl spezifischer. */
export const WIDGET_CLASS_WITH_TYPE_PRIORITY = 175;
/** Treffer über einen Obertyp der Widget-Klasse. */
export const WIDGET_SUPERCLASS_PRIORITY = 140;

/** EAttribute? Dieselbe Duck-Typing-Prüfung wie in der Registry. */
function isEAttribute(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  return (
    'getEAttributeType' in value ||
    (value as { eClass?: () => EClass }).eClass?.()?.getName?.() === 'EAttribute'
  );
}

function isEReference(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  return (
    'getEReferenceType' in value ||
    'isContainment' in value ||
    (value as { eClass?: () => EClass }).eClass?.()?.getName?.() === 'EReference'
  );
}

function isEEnum(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  return (
    'getELiterals' in value ||
    (value as { eClass?: () => EClass }).eClass?.()?.getName?.() === 'EEnum'
  );
}

/**
 * Name der Widget-EClass und aller Obertypen, speziellster zuerst
 * (`['TextAreaWidget', 'InputWidget', 'WidgetComponent', 'Component']`).
 */
export function widgetClassNames(widget: WidgetComponent | undefined): string[] {
  const eClass = widget?.eClass?.();
  if (!eClass) return [];
  const own = eClass.getName?.();
  const supers = (eClass.getEAllSuperTypes?.() ?? [])
    .map((s: EClass) => s.getName?.())
    .filter((n): n is string => !!n);
  return own ? [own, ...supers] : supers;
}

/**
 * Der `MatchContext` zu einem Widget: alles, was
 * `getComponentForFeature` ableitet, plus die Widget-Klasse unter `custom`.
 * Ohne Widget-Registrierung wählt die Registry daraus exakt dasselbe wie
 * bisher — die Zusatzinformation stört keinen der eingebauten Matcher.
 */
export function buildWidgetMatchContext(
  widget: WidgetComponent | undefined,
  feature: EStructuralFeature | undefined,
  model: EObject | undefined,
  custom?: Record<string, unknown>
): MatchContext {
  const context: MatchContext = {};
  if (model) {
    context.eObject = model;
    context.eClass = model.eClass?.();
  }
  if (feature) {
    context.feature = feature;
    if (isEAttribute(feature)) {
      context.attribute = feature as MatchContext['attribute'];
      const eType = feature.getEType?.();
      if (eType && isEEnum(eType)) context.enumType = eType as MatchContext['enumType'];
    } else if (isEReference(feature)) {
      context.reference = feature as MatchContext['reference'];
    }
    if (!context.eClass) {
      const containing = feature.getEContainingClass?.();
      if (containing) context.eClass = containing;
    }
  }
  const names = widgetClassNames(widget);
  context.custom = {
    ...custom,
    [WIDGET_CLASS_KEY]: names[0],
    [WIDGET_CLASSES_KEY]: names,
  };
  return context;
}

/** Die Widget-Klasse aus einem MatchContext, falls gesetzt. */
export function widgetClassOf(context: MatchContext): string | undefined {
  const value = context.custom?.[WIDGET_CLASS_KEY];
  return typeof value === 'string' ? value : undefined;
}

export interface WidgetRegistrationOptions {
  /** Zusätzlich auf den Namen des Datentyps einschränken (z. B. 'EString'). */
  dataTypeName?: string;
  /** Auch für Widget-Klassen gelten, die von dieser erben. */
  includeSubclasses?: boolean;
  /** Priorität überschreiben. */
  priority?: number;
  displayName?: string;
}

/**
 * Registriert einen Renderer für eine Widget-Klasse des UI-Modells.
 *
 * ```ts
 * registerWidgetClass(registry, 'TextAreaWidget', MyTextArea);
 * registerWidgetClass(registry, 'SelectWidget', MySelect, { dataTypeName: 'EString' });
 * ```
 *
 * @returns Funktion zum Abmelden.
 */
export function registerWidgetClass(
  registry: ComponentRegistry,
  widgetClass: string,
  component: Component,
  options: WidgetRegistrationOptions = {}
): () => void {
  const { dataTypeName, includeSubclasses, priority, displayName } = options;

  const matcher = (context: MatchContext): MatchResult => {
    const names = context.custom?.[WIDGET_CLASSES_KEY];
    const list = Array.isArray(names) ? (names as string[]) : [];
    const index = list.indexOf(widgetClass);
    if (index < 0) return { matches: false, priority: Priority.DEFAULT };
    if (index > 0 && !includeSubclasses) return { matches: false, priority: Priority.DEFAULT };

    if (dataTypeName) {
      const typeName = context.feature?.getEType?.()?.getName?.();
      if (typeName !== dataTypeName) return { matches: false, priority: Priority.DEFAULT };
    }

    const base =
      priority ??
      (index > 0
        ? WIDGET_SUPERCLASS_PRIORITY
        : dataTypeName
          ? WIDGET_CLASS_WITH_TYPE_PRIORITY
          : WIDGET_CLASS_PRIORITY);
    return { matches: true, priority: base };
  };

  return registry.register(
    component,
    { type: 'custom', matcher },
    {
      priority: priority ?? WIDGET_CLASS_PRIORITY,
      matcher,
      category: 'editor',
      displayName: displayName ?? `${widgetClass}${dataTypeName ? ` (${dataTypeName})` : ''}`,
    }
  );
}

/** Die vom Composer aufgelöste Widget-Konfiguration, wie sie unter `custom` liegt. */
export interface WidgetCustomContext extends Record<string, unknown> {
  resolvedStyle?: ResolvedStyle;
  rawWidget?: WidgetComponent;
  widgetClass?: string;
  widgetClasses?: string[];
}
