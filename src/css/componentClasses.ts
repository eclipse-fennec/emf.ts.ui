/**
 * Berechnet die CSS-Klassen und data-Attribute, die die Composer auf
 * gerenderte Komponenten stempeln. Gegenstück zu den Selektoren der
 * cssEngine (siehe dort für die Konventionen).
 *
 * Bewusst nur type-Imports auf generierte Klassen — kein eager-Init
 * des CSS-Packages beim Laden der Core-Composer.
 */
import type { EClass, EObject } from '@emfts/core';
import type { Component } from '../generated/Component';
import type { BaseStyle } from '../generated/BaseStyle';
import type { WidgetComponent } from '../generated/WidgetComponent';
import type { StyleSheet } from '../generated/css/StyleSheet';
import type { CssStyle } from '../generated/css/CssStyle';
import type { StyleRule } from '../generated/css/StyleRule';
import { conditionClass, eBool, includesSubtypes, styleClass } from './cssEngine';
import { evaluateBoolean } from '../utils/evaluateExpression';

/** Eigene EClass + alle Supertypen (zyklussicher, Duplikate entfernt). */
export function eClassHierarchyNames(eClass: EClass | undefined): string[] {
  if (!eClass) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  const push = (c: EClass) => {
    const n = c.getName?.();
    if (n && !seen.has(n)) {
      seen.add(n);
      names.push(n);
    }
  };
  push(eClass);
  for (const sup of eClass.getEAllSuperTypes?.() ?? []) push(sup);
  return names;
}

function isCssStyle(style: BaseStyle): style is CssStyle {
  return style.eClass?.()?.getName?.() === 'CssStyle';
}

/**
 * Sammelt die uic-Klassen aller referenzierten CssStyles inklusive
 * ihrer extends-Ketten (Eltern zuerst), zyklussicher.
 */
export function referencedStyleClasses(styles: readonly BaseStyle[] | undefined): string[] {
  const classes: string[] = [];
  const seen = new Set<BaseStyle>();

  function visit(style: BaseStyle | undefined): void {
    if (!style || seen.has(style)) return;
    seen.add(style);
    visit(style.extends);
    if (isCssStyle(style) && style.name) classes.push(styleClass(style.name));
  }

  for (const s of styles ?? []) visit(s);
  return classes;
}

/** Statische Selektor-Kriterien einer Regel gegen eine Komponente prüfen. */
export function ruleMatchesComponent(rule: StyleRule, component: Component): boolean {
  const targetName = rule.targetClass?.getName?.();
  if (targetName) {
    const hierarchy = eClassHierarchyNames(component.eClass?.());
    if (includesSubtypes(rule)) {
      if (!hierarchy.includes(targetName)) return false;
    } else if (hierarchy[0] !== targetName) {
      return false;
    }
  }
  if (rule.componentName && component.name !== rule.componentName) return false;
  if (rule.group && component.group !== rule.group) return false;
  return true;
}

export interface ComponentClassOptions {
  /** Domänenobjekt für condition-Auswertung dynamischer Regeln. */
  model?: EObject;
  /** Aktive StyleSheets (für conditionClass-Stamping). */
  sheets?: readonly StyleSheet[];
  /** Zusätzlich gemergter css-String aus der resolveStyleChain-Kaskade. */
  resolvedCss?: string;
}

/**
 * Alle CSS-Klassen einer gerenderten Komponente:
 * uim-component, EClass-Hierarchie, referenzierte uic-Styles,
 * resolvedCss-Klassen und erfüllte condition-Regeln.
 */
export function componentCssClasses(
  component: Component,
  options: ComponentClassOptions = {}
): string[] {
  const classes = ['uim-component'];

  for (const name of eClassHierarchyNames(component.eClass?.())) {
    classes.push(`uim-c-${name}`);
  }

  classes.push(...referencedStyleClasses(component.styles));

  if (options.resolvedCss) {
    classes.push(...options.resolvedCss.split(/\s+/).filter(Boolean));
  }

  for (const sheet of options.sheets ?? []) {
    sheet.rules.forEach((rule, index) => {
      if (!rule.condition) return;
      if (!ruleMatchesComponent(rule, component)) return;
      if (!options.model) return;
      if (evaluateBoolean(rule.condition, options.model)) {
        classes.push(conditionClass(sheet, index));
      }
    });
  }

  return [...new Set(classes)];
}

/** data-Attribute für exakte Selektoren. */
export function componentDataAttrs(component: Component): Record<string, string> {
  const attrs: Record<string, string> = {};
  const eclassName = component.eClass?.()?.getName?.();
  if (eclassName) attrs['data-uim-eclass'] = eclassName;
  if (component.name) attrs['data-uim-name'] = component.name;
  if (component.group) attrs['data-uim-group'] = component.group;
  return attrs;
}

/** Zustands-Klassen eines Widgets (required/readonly), Binding-aufgelöst. */
export function widgetStateClasses(
  widget: WidgetComponent,
  resolvedReadOnly?: boolean,
  resolvedRequired?: boolean
): string[] {
  const classes: string[] = [];
  if (eBool(resolvedRequired ?? widget.required)) classes.push('uim-s-required');
  if (eBool(resolvedReadOnly ?? widget.readOnly)) classes.push('uim-s-readonly');
  return classes;
}
