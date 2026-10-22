import type { BaseStyle } from '../generated/BaseStyle';
import type { LayoutStyle } from '../generated/LayoutStyle';
import type { WidgetStyle } from '../generated/WidgetStyle';
import type { ResolvedStyle } from '../types/ResolvedStyle';
import { isSet } from './isSet';

/**
 * Resolves the full extends-chain of a BaseStyle into a flat ResolvedStyle.
 * Child values override parent values (like CSS cascade / SCSS @extend).
 * Cycle-safe: tracks visited styles to prevent infinite loops.
 */
export function resolveStyleChain(
  style: BaseStyle | undefined,
  visited = new Set<BaseStyle>()
): ResolvedStyle {
  if (!style) return {};
  if (visited.has(style)) return {};

  visited.add(style);

  const parent = style.extends
    ? resolveStyleChain(style.extends, visited)
    : {};

  const own = extractStyleValues(style);

  return merge(parent, own);
}

/**
 * Resolves multiple styles in order (like multiple CSS classes).
 * Later styles override earlier ones.
 */
export function resolveStyleList(styles: Iterable<BaseStyle>): ResolvedStyle {
  return [...styles].reduce<ResolvedStyle>(
    (acc, style) => merge(acc, resolveStyleChain(style)),
    {}
  );
}

function extractStyleValues(style: BaseStyle): ResolvedStyle {
  const result: ResolvedStyle = {};

  // Nur gesetzte Attribute kaskadieren — Defaults (layout=VERTICAL,
  // readOnly=false, order=0) dürfen Eltern-Werte nicht überschreiben.
  if (isSet(style, 'css')) result.css = style.css;
  if (isSet(style, 'vueComponent')) result.vueComponent = style.vueComponent;

  const layoutStyle = style as LayoutStyle;
  if (isSet(style, 'layout')) result.layout = layoutStyle.layout;

  const widgetStyle = style as WidgetStyle;
  if (isSet(style, 'widgetType')) result.widgetType = widgetStyle.widgetType;
  if (isSet(style, 'label')) result.label = widgetStyle.label;
  if (isSet(style, 'readOnly')) result.readOnly = widgetStyle.readOnly;

  // order gibt es auf LayoutStyle und WidgetStyle
  if (isSet(style, 'order')) result.order = (style as LayoutStyle | WidgetStyle).order;

  return result;
}

function merge(parent: ResolvedStyle, child: ResolvedStyle): ResolvedStyle {
  return {
    ...parent,
    ...Object.fromEntries(
      Object.entries(child).filter(([, v]) => v !== undefined)
    ),
    // Merge CSS classes (append, not replace)
    css: [parent.css, child.css].filter(Boolean).join(' ') || undefined,
  };
}
