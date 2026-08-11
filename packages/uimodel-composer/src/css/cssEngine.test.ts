import { describe, expect, it } from 'vitest';
import {
  conditionClass,
  generateCss,
  resolveValue,
  ruleSelector,
  styleClass,
  themeClass,
  tokenVar,
} from './cssEngine';
import {
  componentCssClasses,
  eClassHierarchyNames,
  referencedStyleClasses,
  ruleMatchesComponent,
} from './componentClasses';
import type { StyleSheet } from '../generated/css/StyleSheet';
import type { CssStyle } from '../generated/css/CssStyle';
import type { StyleRule } from '../generated/css/StyleRule';
import type { Component } from '../generated/Component';

// ─── Test-Doubles ──────────────────────────────────────────────────────
// Reine Struktur-Doubles für die pure Engine (kein EMF-Laufzeitverhalten
// nötig — die Engine liest nur Properties und eClass()-Namen).

function fakeEClass(name: string, supers: string[] = []) {
  return {
    getName: () => name,
    getEAllSuperTypes: () => supers.map((s) => fakeEClass(s)),
  };
}

function decl(property: string, value: string, important = false) {
  return { property, value, important } as never;
}

function sheet(partial: Partial<StyleSheet>): StyleSheet {
  return {
    name: 'test',
    tokens: [],
    themes: [],
    styles: [],
    rules: [],
    ...partial,
  } as unknown as StyleSheet;
}

function cssStyle(name: string, partial: Partial<CssStyle> = {}): CssStyle {
  return {
    name,
    declarations: [],
    states: [],
    eClass: () => fakeEClass('CssStyle', ['BaseStyle', 'Style']),
    ...partial,
  } as unknown as CssStyle;
}

function rule(partial: Partial<StyleRule>): StyleRule {
  return {
    includeSubtypes: true,
    priority: 0,
    declarations: [],
    states: [],
    ...partial,
  } as unknown as StyleRule;
}

function component(eclass: string, supers: string[], partial: Partial<Component> = {}): Component {
  return {
    name: 'c1',
    styles: [],
    eClass: () => fakeEClass(eclass, supers),
    ...partial,
  } as unknown as Component;
}

// ─── Token & Werte ─────────────────────────────────────────────────────

describe('tokenVar / resolveValue', () => {
  it('maps token names to prefixed custom properties', () => {
    expect(tokenVar('color-primary')).toBe('--uic-color-primary');
    expect(tokenVar('Spacing 2')).toBe('--uic-spacing-2');
  });

  it('replaces token() references and keeps other values', () => {
    expect(resolveValue('token(color-primary)')).toBe('var(--uic-color-primary)');
    expect(resolveValue('1px solid token( color-border )')).toBe('1px solid var(--uic-color-border)');
    expect(resolveValue('var(--x, 1rem)')).toBe('var(--x, 1rem)');
  });
});

// ─── CSS-Generierung ───────────────────────────────────────────────────

describe('generateCss', () => {
  it('renders tokens on :root and theme overrides', () => {
    const token = { name: 'color-primary', value: '#5b5fd6' } as never;
    const css = generateCss(
      sheet({
        tokens: [token],
        themes: [
          {
            name: 'dark',
            dark: true,
            overrides: [{ token, value: '#8f93ff' } as never],
          } as never,
        ],
      })
    );
    expect(css).toContain(':root, .uicss-scope {');
    expect(css).toContain('--uic-color-primary: #5b5fd6;');
    expect(css).toContain(`.${themeClass('dark')} {`);
    expect(css).toContain('--uic-color-primary: #8f93ff;');
    expect(css).toContain('color-scheme: dark;');
  });

  it('renders named styles with states, parents before children', () => {
    const parent = cssStyle('base', { declarations: [decl('padding', 'token(spacing-2)')] });
    const child = cssStyle('accent', {
      extends: parent,
      declarations: [decl('color', 'red', true)],
      states: [{ state: 'HOVER', declarations: [decl('color', 'darkred')] } as never],
    });
    // Kind absichtlich vor Elter im Sheet — Topo-Sortierung muss drehen
    const css = generateCss(sheet({ styles: [child, parent] }));
    expect(css.indexOf('.uic-base')).toBeLessThan(css.indexOf('.uic-accent'));
    expect(css).toContain('padding: var(--uic-spacing-2);');
    expect(css).toContain('color: red !important;');
    expect(css).toContain('.uic-accent:hover {');
  });

  it('renders rules sorted by priority with media and pseudo states', () => {
    const low = rule({
      targetClass: fakeEClass('WidgetComponent') as never,
      priority: 0,
      declarations: [decl('gap', '4px')],
    });
    const high = rule({
      targetClass: fakeEClass('InputWidget') as never,
      includeSubtypes: false,
      componentName: 'firstName',
      priority: 10,
      media: '(max-width: 600px)',
      declarations: [decl('width', '100%')],
      states: [{ state: 'READONLY', declarations: [decl('opacity', '0.6')] } as never],
    });
    // hohe Priorität zuerst im Modell — Ausgabe muss sie nach hinten sortieren
    const css = generateCss(sheet({ rules: [high, low] }));
    expect(css.indexOf('.uim-c-WidgetComponent')).toBeLessThan(css.indexOf('data-uim-eclass'));
    expect(css).toContain('.uim-component[data-uim-eclass="InputWidget"][data-uim-name="firstName"]');
    expect(css).toContain('@media (max-width: 600px) {');
    expect(css).toContain('.uim-s-readonly {');
  });

  it('appends the condition class to conditional rule selectors', () => {
    const s = sheet({
      rules: [
        rule({
          condition: { language: 'JS', body: 'true' } as never,
          declarations: [decl('outline', '1px solid red')],
        }),
      ],
    });
    expect(ruleSelector(s, s.rules[0], 0)).toBe(`.uim-component.${conditionClass(s, 0)}`);
    expect(generateCss(s)).toContain(`.${conditionClass(s, 0)} {`);
  });
});

// ─── Klassen-Stamping ──────────────────────────────────────────────────

describe('componentClasses', () => {
  it('collects the EClass hierarchy', () => {
    expect(eClassHierarchyNames(fakeEClass('InputWidget', ['WidgetComponent', 'Component']) as never))
      .toEqual(['InputWidget', 'WidgetComponent', 'Component']);
  });

  it('collects uic classes along the extends chain, parents first', () => {
    const parent = cssStyle('base');
    const child = cssStyle('accent', { extends: parent });
    expect(referencedStyleClasses([child])).toEqual([styleClass('base'), styleClass('accent')]);
  });

  it('matches rules by hierarchy, exact class, name and group', () => {
    const input = component('InputWidget', ['WidgetComponent', 'Component'], {
      name: 'firstName',
      group: 'person',
    });
    expect(ruleMatchesComponent(rule({ targetClass: fakeEClass('WidgetComponent') as never }), input)).toBe(true);
    expect(
      ruleMatchesComponent(
        rule({ targetClass: fakeEClass('WidgetComponent') as never, includeSubtypes: false }),
        input
      )
    ).toBe(false);
    expect(ruleMatchesComponent(rule({ componentName: 'lastName' }), input)).toBe(false);
    expect(ruleMatchesComponent(rule({ group: 'person' }), input)).toBe(true);
  });

  it('stamps base, hierarchy, style and condition classes', () => {
    const s = sheet({
      rules: [
        rule({
          targetClass: fakeEClass('InputWidget') as never,
          condition: { language: 'JS', body: 'self.name === "x"' } as never,
        }),
      ],
    });
    const comp = component('InputWidget', ['WidgetComponent', 'Component'], {
      styles: [cssStyle('accent')] as never,
    });
    const model = { eClass: () => ({ getEStructuralFeature: (n: string) => (n === 'name' ? {} : undefined) }), eGet: () => 'x' } as never;
    const classes = componentCssClasses(comp, { sheets: [s], model, resolvedCss: 'legacy-class' });
    expect(classes).toContain('uim-component');
    expect(classes).toContain('uim-c-InputWidget');
    expect(classes).toContain('uim-c-Component');
    expect(classes).toContain('uic-accent');
    expect(classes).toContain('legacy-class');
    expect(classes).toContain(conditionClass(s, 0));
  });
});
