/**
 * CSS-Engine: übersetzt ein StyleSheet-Modell (uimodel-css.ecore) in echtes CSS.
 *
 * Erzeugte Struktur (in dieser Reihenfolge):
 *   1. Tokens   → Custom Properties auf :root und .uicss-scope
 *   2. Themes   → .uicss-theme-<name> mit Token-Overrides
 *   3. Rules    → selektorbasierte Regeln (nach priority aufsteigend)
 *   4. Styles   → benannte Klassen .uic-<name> (extends-Eltern zuerst,
 *                 damit Kind-Deklarationen bei gleicher Spezifität gewinnen)
 *
 * Selektor-Konventionen (von den Composern gestempelt):
 *   .uim-component               jede gerenderte Komponente
 *   .uim-c-<EClassName>          EClass inkl. aller Supertypen
 *   [data-uim-eclass="X"]        exakte EClass (includeSubtypes=false)
 *   [data-uim-name="X"]          Component.name
 *   [data-uim-group="X"]         Component.group
 *   .uim-s-required|-readonly|-disabled|-invalid   Widget-Zustände
 *   .uicss-cond-<sheet>-<i>      dynamische Regel-Condition erfüllt
 */
import type { StyleSheet } from '../generated/css/StyleSheet';
import type { CssDeclaration } from '../generated/css/CssDeclaration';
import type { CssState } from '../generated/css/CssState';
import type { CssStyle } from '../generated/css/CssStyle';
import type { StyleRule } from '../generated/css/StyleRule';

/** Prefix für Token-Custom-Properties: color-primary → --uic-color-primary */
export const TOKEN_PREFIX = 'uic';

// XMI-geladene EBoolean/EInt-Attribute kommen als String aus eGet —
// vor Vergleichen/Arithmetik immer coercen.
/** true, wenn der Wert (auch als XMI-String) true ist. */
export function eBool(value: unknown): boolean {
  return value === true || value === 'true';
}

/** Zahlwert (auch als XMI-String), sonst Fallback. */
export function eNum(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const PSEUDO_SELECTOR: Record<string, string> = {
  HOVER: ':hover',
  FOCUS: ':focus',
  FOCUS_WITHIN: ':focus-within',
  ACTIVE: ':active',
  DISABLED: '.uim-s-disabled',
  READONLY: '.uim-s-readonly',
  INVALID: '.uim-s-invalid',
  REQUIRED: '.uim-s-required',
};

/** Namen in CSS-taugliche Klassenbestandteile umwandeln. */
export function slug(name: string): string {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'unnamed';
}

/** Custom-Property-Name eines Tokens. */
export function tokenVar(tokenName: string): string {
  return `--${TOKEN_PREFIX}-${slug(tokenName)}`;
}

/**
 * Ersetzt token(<name>)-Referenzen in einem Declaration-Value durch
 * var(--uic-<name>). Direkte var(...)-Ausdrücke bleiben unangetastet.
 */
export function resolveValue(value: string): string {
  return value.replace(/token\(\s*([^)]+?)\s*\)/g, (_, name: string) => `var(${tokenVar(name)})`);
}

/** CSS-Klassenname eines benannten CssStyle. */
export function styleClass(styleName: string): string {
  return `uic-${slug(styleName)}`;
}

/** Klassenname eines Themes (auf einem Vorfahren-Element aktivieren). */
export function themeClass(themeName: string): string {
  return `uicss-theme-${slug(themeName)}`;
}

/**
 * Klassenname, den Composer stempeln, wenn die condition einer Regel
 * zur Laufzeit erfüllt ist. Muss zwischen Engine (Selektor) und
 * componentCssClasses (Stamping) identisch berechnet werden.
 */
export function conditionClass(sheet: StyleSheet, ruleIndex: number): string {
  return `uicss-cond-${slug(sheet.name ?? 'sheet')}-${ruleIndex}`;
}

function renderDeclarations(declarations: CssDeclaration[], indent = '  '): string {
  return declarations
    .filter((d) => d.property && d.value !== undefined)
    .map((d) => `${indent}${d.property.trim()}: ${resolveValue(d.value)}${eBool(d.important) ? ' !important' : ''};`)
    .join('\n');
}

function renderStates(baseSelector: string, states: CssState[]): string {
  return states
    .filter((s) => s.declarations.length > 0)
    .map((s) => {
      // Enum-Werte können als Literal-String oder EEnumLiteral-Objekt vorliegen
      const stateName =
        (s.state as unknown as { getName?: () => string })?.getName?.() ?? String(s.state);
      const suffix = PSEUDO_SELECTOR[stateName] ?? `:${stateName.toLowerCase()}`;
      return `${baseSelector}${suffix} {\n${renderDeclarations(s.declarations)}\n}`;
    })
    .join('\n');
}

function renderBlock(selector: string, declarations: CssDeclaration[], states: CssState[], media?: string): string {
  const parts: string[] = [];
  if (declarations.length > 0) {
    parts.push(`${selector} {\n${renderDeclarations(declarations)}\n}`);
  }
  const stateCss = renderStates(selector, states);
  if (stateCss) parts.push(stateCss);
  if (parts.length === 0) return '';
  const body = parts.join('\n');
  return media ? `@media ${media} {\n${body}\n}` : body;
}

/** includeSubtypes mit Default true (XMI-String-sicher). */
export function includesSubtypes(rule: StyleRule): boolean {
  return rule.includeSubtypes === undefined || rule.includeSubtypes === null
    ? true
    : eBool(rule.includeSubtypes);
}

/**
 * Statischer Selektor einer StyleRule (ohne condition-Auswertung —
 * die condition wird über die gestempelte conditionClass angebunden).
 */
export function ruleSelector(sheet: StyleSheet, rule: StyleRule, ruleIndex: number): string {
  let selector: string;
  const targetName = rule.targetClass?.getName?.();
  if (targetName) {
    selector = includesSubtypes(rule)
      ? `.uim-c-${targetName}`
      : `.uim-component[data-uim-eclass="${targetName}"]`;
  } else {
    selector = '.uim-component';
  }
  if (rule.componentName) selector += `[data-uim-name="${rule.componentName}"]`;
  if (rule.group) selector += `[data-uim-group="${rule.group}"]`;
  if (rule.condition) selector += `.${conditionClass(sheet, ruleIndex)}`;
  return selector;
}

/**
 * Sortiert die extends-Ketten der benannten Styles topologisch
 * (Eltern vor Kindern), zyklussicher.
 */
function topoSortStyles(styles: CssStyle[]): CssStyle[] {
  const inSheet = new Set<CssStyle>(styles);
  const sorted: CssStyle[] = [];
  const done = new Set<CssStyle>();

  function visit(style: CssStyle, path: Set<CssStyle>): void {
    if (done.has(style) || path.has(style)) return;
    path.add(style);
    const parent = style.extends as CssStyle | undefined;
    if (parent && inSheet.has(parent)) visit(parent, path);
    path.delete(style);
    done.add(style);
    sorted.push(style);
  }

  for (const s of styles) visit(s, new Set());
  return sorted;
}

/** Erzeugt das komplette CSS eines StyleSheets. */
export function generateCss(sheet: StyleSheet): string {
  const sections: string[] = [];

  // 1. Tokens
  if (sheet.tokens.length > 0) {
    const lines = sheet.tokens
      .filter((t) => t.name)
      .map((t) => `  ${tokenVar(t.name)}: ${t.value ?? ''};`);
    sections.push(`:root, .uicss-scope {\n${lines.join('\n')}\n}`);
  }

  // 2. Themes
  for (const theme of sheet.themes) {
    if (!theme.name) continue;
    const lines = theme.overrides
      .filter((o) => o.token?.name)
      .map((o) => `  ${tokenVar(o.token.name)}: ${o.value ?? ''};`);
    if (eBool(theme.dark)) lines.push('  color-scheme: dark;');
    if (lines.length > 0) {
      sections.push(`.${themeClass(theme.name)} {\n${lines.join('\n')}\n}`);
    }
  }

  // 3. Rules (priority aufsteigend, stabile Reihenfolge; spätere gewinnen)
  const indexed = sheet.rules.map((rule, index) => ({ rule, index }));
  indexed.sort((a, b) => eNum(a.rule.priority) - eNum(b.rule.priority) || a.index - b.index);
  for (const { rule, index } of indexed) {
    const block = renderBlock(
      ruleSelector(sheet, rule, index),
      rule.declarations,
      rule.states,
      rule.media || undefined
    );
    if (block) sections.push(block);
  }

  // 4. Benannte Styles (Eltern vor Kindern)
  for (const style of topoSortStyles(sheet.styles)) {
    if (!style.name) continue;
    const block = renderBlock(`.${styleClass(style.name)}`, style.declarations, style.states);
    if (block) sections.push(block);
  }

  return sections.join('\n\n');
}

/** Erzeugt das CSS mehrerer StyleSheets in Reihenfolge. */
export function generateCssForSheets(sheets: StyleSheet[]): string {
  return sheets.map(generateCss).filter(Boolean).join('\n\n');
}
