/**
 * Symbologie: (Renderer, Domänenobjekt) → wirksames Symbol.
 *
 * Nach dem Muster von uimodel-maps (SingleSymbolRenderer / CategorizedRenderer /
 * RuleBasedRenderer), damit Karte und Diagramm dieselben Begriffe tragen. Die
 * Attribute von NodeSymbol und EdgeSymbol sind `unsettable`: nur gesetzte Werte
 * überschreiben, womit eine Overlay-Regel (z. B. "Gerät nicht erreichbar →
 * roter Rahmen") die Form und Größe der Kategorie stehen lässt.
 */
import { EcoreUtil } from '@emfts/core'
import type { EObject, EStructuralFeature } from '@emfts/core'
import { evaluateBoolean } from '@emfts/uimodel-composer'

export type ShapeName =
  | 'COMPARTMENTS'
  | 'RECTANGLE'
  | 'ROUND_RECTANGLE'
  | 'CUT_RECTANGLE'
  | 'ELLIPSE'
  | 'DIAMOND'
  | 'OCTAGON'
  | 'TRIANGLE'
  | 'HEXAGON'

export type LineStyleName = 'SOLID' | 'DASH' | 'DOT' | 'DASH_DOT' | 'DOUBLE'
export type LabelPlacementName = 'BELOW' | 'ABOVE' | 'LEFT' | 'RIGHT' | 'CENTER' | 'NONE'

/** Ein aufgelöstes Knotensymbol — alle Werte belegt, bereit zum Zeichnen. */
export interface SymbolView {
  shape: ShapeName
  width: number
  height: number
  fillColor: string
  strokeColor: string
  strokeWidth: number
  strokeStyle: LineStyleName
  opacity: number
  labelPlacement: LabelPlacementName
  fontSize: number
  textColor: string
  bold: boolean
}

export interface EdgeSymbolView {
  color: string
  width: number
  style: LineStyleName
  opacity: number
}

/** Der Kastenknoten mit Kopf und Zeilen — was ohne Renderer herauskommt. */
export const COMPARTMENT_SYMBOL: SymbolView = {
  shape: 'COMPARTMENTS',
  width: 220,
  height: 54,
  fillColor: '#ffffff',
  strokeColor: '#374151',
  strokeWidth: 1,
  strokeStyle: 'SOLID',
  opacity: 1,
  labelPlacement: 'CENTER',
  fontSize: 12,
  textColor: '#111827',
  bold: false,
}

/** Grundwerte eines Symbolknotens, bevor der Renderer sie überschreibt. */
export const DEFAULT_SYMBOL: SymbolView = {
  shape: 'ROUND_RECTANGLE',
  width: 24,
  height: 24,
  fillColor: '#ffffff',
  strokeColor: '#64748b',
  strokeWidth: 1.5,
  strokeStyle: 'SOLID',
  opacity: 1,
  labelPlacement: 'BELOW',
  fontSize: 10,
  textColor: '#334155',
  bold: false,
}

/** Grundwerte eines Rahmens (NodeGrouping ohne eigenen Renderer). */
export const FRAME_SYMBOL: SymbolView = {
  shape: 'ROUND_RECTANGLE',
  width: 0,
  height: 0,
  fillColor: '#f1f5f9',
  strokeColor: '#94a3b8',
  strokeWidth: 1,
  strokeStyle: 'SOLID',
  opacity: 0.6,
  labelPlacement: 'ABOVE',
  fontSize: 12,
  textColor: '#334155',
  bold: true,
}

export const DEFAULT_EDGE_SYMBOL: EdgeSymbolView = {
  color: '#94a3b8',
  width: 1.2,
  style: 'SOLID',
  opacity: 1,
}

/* --------------------------------------------------------------- Helfer */

function feature(o: EObject, name: string): EStructuralFeature | undefined {
  return o.eClass().getEStructuralFeature(name) ?? undefined
}

/** Liest ein Feature; undefined, wenn es die Klasse nicht kennt. */
function get(o: EObject, name: string): unknown {
  const f = feature(o, name)
  if (!f) return undefined
  try {
    return o.eGet(f)
  } catch {
    return undefined
  }
}

/** Nur gesetzte Werte zählen: `unsettable` trennt "nicht angegeben" von 0/''. */
function isSet(o: EObject, name: string): boolean {
  const f = feature(o, name)
  if (!f) return false
  try {
    return o.eIsSet(f)
  } catch {
    return get(o, name) != null
  }
}

function className(o: EObject): string {
  return o.eClass().getName() ?? ''
}

/** Löst einen Querverweis-Proxy auf (z. B. ein href ins Domänen-Metamodell). */
function deproxy<T extends EObject>(o: T | null | undefined, ctx: EObject): T | undefined {
  if (!o) return undefined
  const proxy = o as { eIsProxy?: () => boolean }
  if (typeof proxy.eIsProxy !== 'function' || !proxy.eIsProxy()) return o
  return EcoreUtil.resolve(o, ctx) as T | undefined
}

function featureRef(o: EObject, name: string): EStructuralFeature | undefined {
  return deproxy(get(o, name) as EObject | undefined, o) as EStructuralFeature | undefined
}

/** Der Wert eines Features als Zeichenkette — bei einem EEnum der Literalname. */
export function featureValueAsString(obj: EObject | null, f: EStructuralFeature | undefined): string {
  if (!f || !obj) return ''
  let v: unknown
  try {
    v = obj.eGet(f)
  } catch {
    return ''
  }
  if (v == null) return ''
  if (typeof (v as { eClass?: unknown }).eClass === 'function') {
    const ref = deproxy(v as EObject, obj)
    const nf = ref ? feature(ref, 'name') : undefined
    return nf && ref ? String(ref.eGet(nf) ?? '') : ''
  }
  return String(v)
}

function truthy(v: unknown): boolean {
  return v === true || v === 'true' || (typeof v === 'number' && v !== 0)
}

/** Trifft eine Regel auf das Objekt zu? `whenFeature` ist die Kurzform für
 *  "dieses Feature ist wahr", `filter` der vollständige Ausdruck. */
function ruleMatches(rule: EObject, obj: EObject | null): boolean {
  if (!obj) return false
  const wf = featureRef(rule, 'whenFeature')
  if (wf) return truthy(obj.eGet(wf))
  const filter = get(rule, 'filter') as EObject | undefined | null
  if (!filter) return false
  return evaluateBoolean(
    {
      language: String(get(filter, 'language') ?? ''),
      body: String(get(filter, 'body') ?? ''),
    } as never,
    obj,
  )
}

/* ------------------------------------------------------- Knotensymbole */

/** Überträgt die gesetzten Attribute eines NodeSymbol auf die Basis. */
function applyNodeSymbol(base: SymbolView, symbol: EObject | null | undefined): SymbolView {
  if (!symbol) return base
  const out = { ...base }
  if (isSet(symbol, 'shape')) out.shape = String(get(symbol, 'shape')) as ShapeName
  if (isSet(symbol, 'width')) out.width = Number(get(symbol, 'width'))
  if (isSet(symbol, 'height')) out.height = Number(get(symbol, 'height'))
  if (isSet(symbol, 'fillColor')) out.fillColor = String(get(symbol, 'fillColor'))
  if (isSet(symbol, 'strokeColor')) out.strokeColor = String(get(symbol, 'strokeColor'))
  if (isSet(symbol, 'strokeWidth')) out.strokeWidth = Number(get(symbol, 'strokeWidth'))
  if (isSet(symbol, 'strokeStyle')) out.strokeStyle = String(get(symbol, 'strokeStyle')) as LineStyleName
  if (isSet(symbol, 'opacity')) out.opacity = Number(get(symbol, 'opacity'))
  if (isSet(symbol, 'labelPlacement')) {
    out.labelPlacement = String(get(symbol, 'labelPlacement')) as LabelPlacementName
  }
  if (isSet(symbol, 'fontSize')) out.fontSize = Number(get(symbol, 'fontSize'))
  if (isSet(symbol, 'textColor')) out.textColor = String(get(symbol, 'textColor'))
  if (isSet(symbol, 'bold')) out.bold = truthy(get(symbol, 'bold'))
  // Eine quadratische Angabe genügt: width ohne height heißt "so hoch wie breit".
  if (isSet(symbol, 'width') && !isSet(symbol, 'height')) out.height = out.width
  if (isSet(symbol, 'height') && !isSet(symbol, 'width')) out.width = out.height
  return out
}

/**
 * Das wirksame Symbol eines Knotens. Ohne Renderer bleibt es beim Kastenknoten,
 * damit bestehende Klassendiagramme unverändert zeichnen.
 */
export function resolveNodeSymbol(obj: EObject | null, renderer: EObject | null | undefined): SymbolView {
  // Ohne Renderer bleibt es beim Kastenknoten; mit Renderer setzen die Symbole
  // auf den Grundwerten eines Symbolknotens auf.
  return renderer ? render(obj, renderer, DEFAULT_SYMBOL) : COMPARTMENT_SYMBOL
}

/** Das Symbol eines Rahmens — dieselben Renderer, andere Grundwerte. */
export function resolveFrameSymbol(obj: EObject | null, renderer: EObject | null | undefined): SymbolView {
  return renderer ? render(obj, renderer, FRAME_SYMBOL) : FRAME_SYMBOL
}

function render(obj: EObject | null, renderer: EObject, base: SymbolView): SymbolView {
  return applyOverlays(obj, renderer, baseSymbol(obj, renderer, base), applyNodeSymbol)
}

/** Das Grundsymbol: Einzelsymbol, Kategorie oder erste zutreffende Regel. */
function baseSymbol(obj: EObject | null, renderer: EObject, base: SymbolView): SymbolView {
  const kind = className(renderer)

  if (kind === 'SingleNodeRenderer') {
    return applyNodeSymbol(base, get(renderer, 'symbol') as EObject | undefined)
  }

  if (kind === 'CategorizedNodeRenderer') {
    const value = featureValueAsString(obj, featureRef(renderer, 'classFeature'))
    const categories = (get(renderer, 'categories') as { toArray(): EObject[] } | undefined)?.toArray() ?? []
    const hit = categories.find((c) => String(get(c, 'value') ?? '') === value)
    return applyNodeSymbol(
      base,
      hit ? (get(hit, 'symbol') as EObject | undefined) : (get(renderer, 'fallback') as EObject | undefined),
    )
  }

  if (kind === 'RuleBasedNodeRenderer') {
    const rules = (get(renderer, 'rules') as { toArray(): EObject[] } | undefined)?.toArray() ?? []
    const hit = rules.find((r) => ruleMatches(r, obj))
    return applyNodeSymbol(
      base,
      hit ? (get(hit, 'symbol') as EObject | undefined) : (get(renderer, 'fallback') as EObject | undefined),
    )
  }

  return base
}

/**
 * Legt die Overlays des Renderers in Reihenfolge über das Grundsymbol. Jedes
 * überschreibt nur, was es selbst setzt — die Form der Kategorie bleibt also
 * stehen, während ein Zustand die Rahmenfarbe ändert.
 */
function applyOverlays<T>(
  obj: EObject | null,
  renderer: EObject,
  view: T,
  apply: (base: T, symbol: EObject | null | undefined) => T,
): T {
  const overlays = (get(renderer, 'overlays') as { toArray(): EObject[] } | undefined)?.toArray() ?? []
  let out = view
  for (const overlay of overlays) {
    if (!ruleMatches(overlay, obj)) continue
    out = apply(out, get(overlay, 'symbol') as EObject | undefined)
  }
  return out
}

/* --------------------------------------------------------- Kantensymbole */

function applyEdgeSymbol(base: EdgeSymbolView, symbol: EObject | null | undefined): EdgeSymbolView {
  if (!symbol) return base
  const out = { ...base }
  if (isSet(symbol, 'color')) out.color = String(get(symbol, 'color'))
  if (isSet(symbol, 'width')) out.width = Number(get(symbol, 'width'))
  if (isSet(symbol, 'style')) out.style = String(get(symbol, 'style')) as LineStyleName
  if (isSet(symbol, 'opacity')) out.opacity = Number(get(symbol, 'opacity'))
  return out
}

/** Das wirksame Symbol einer Kante; ohne Renderer die Grundlinie. */
export function resolveEdgeSymbol(obj: EObject | null, renderer: EObject | null | undefined): EdgeSymbolView {
  if (!renderer) return DEFAULT_EDGE_SYMBOL
  return applyOverlays(obj, renderer, baseEdgeSymbol(obj, renderer), applyEdgeSymbol)
}

function baseEdgeSymbol(obj: EObject | null, renderer: EObject): EdgeSymbolView {
  const kind = className(renderer)

  if (kind === 'SingleEdgeRenderer') {
    return applyEdgeSymbol(DEFAULT_EDGE_SYMBOL, get(renderer, 'symbol') as EObject | undefined)
  }

  if (kind === 'CategorizedEdgeRenderer') {
    const value = featureValueAsString(obj, featureRef(renderer, 'classFeature'))
    const categories = (get(renderer, 'categories') as { toArray(): EObject[] } | undefined)?.toArray() ?? []
    const hit = categories.find((c) => String(get(c, 'value') ?? '') === value)
    return applyEdgeSymbol(
      DEFAULT_EDGE_SYMBOL,
      hit ? (get(hit, 'symbol') as EObject | undefined) : (get(renderer, 'fallback') as EObject | undefined),
    )
  }

  if (kind === 'RuleBasedEdgeRenderer') {
    const rules = (get(renderer, 'rules') as { toArray(): EObject[] } | undefined)?.toArray() ?? []
    const hit = rules.find((r) => ruleMatches(r, obj))
    return applyEdgeSymbol(
      DEFAULT_EDGE_SYMBOL,
      hit ? (get(hit, 'symbol') as EObject | undefined) : (get(renderer, 'fallback') as EObject | undefined),
    )
  }

  return DEFAULT_EDGE_SYMBOL
}

/** Strichmuster für SVG; SOLID und DOUBLE kommen ohne aus. */
export function dashArray(style: LineStyleName, width: number): string | undefined {
  const w = Math.max(1, width)
  switch (style) {
    case 'DASH':
      return `${w * 3} ${w * 2}`
    case 'DOT':
      return `${w} ${w * 1.8}`
    case 'DASH_DOT':
      return `${w * 3} ${w * 1.6} ${w} ${w * 1.6}`
    default:
      return undefined
  }
}

/** Der SVG-Pfad einer Form in einem Kasten von w×h, Ursprung oben links. */
export function shapePath(shape: ShapeName, w: number, h: number): string {
  const cut = Math.min(w, h) * 0.22
  switch (shape) {
    case 'DIAMOND':
      return `M${w / 2},0 L${w},${h / 2} L${w / 2},${h} L0,${h / 2} Z`
    case 'TRIANGLE':
      return `M${w / 2},0 L${w},${h} L0,${h} Z`
    case 'OCTAGON': {
      const c = Math.min(w, h) * 0.29
      return `M${c},0 L${w - c},0 L${w},${c} L${w},${h - c} L${w - c},${h} L${c},${h} L0,${h - c} L0,${c} Z`
    }
    case 'HEXAGON': {
      const c = w * 0.25
      return `M${c},0 L${w - c},0 L${w},${h / 2} L${w - c},${h} L${c},${h} L0,${h / 2} Z`
    }
    case 'CUT_RECTANGLE':
      return `M${cut},0 L${w - cut},0 L${w},${cut} L${w},${h - cut} L${w - cut},${h} L${cut},${h} L0,${h - cut} L0,${cut} Z`
    default:
      return `M0,0 L${w},0 L${w},${h} L0,${h} Z`
  }
}

/** Geometrie eines Symbolknotens: Kasten und Lage des Symbols darin. */
export interface SymbolBox {
  /** Breite des ELK-Knotens, Beschriftung eingerechnet */
  w: number
  h: number
  /** Linke obere Ecke des Symbols im Knoten */
  symbolX: number
  symbolY: number
  /** Ankerpunkt der Beschriftung */
  labelX: number
  labelY: number
  anchor: 'start' | 'middle' | 'end'
}

const LINE_FACTOR = 1.35
/** Mittlere Zeichenbreite einer serifenlosen Schrift, ausreichend fürs Layout. */
const CHAR_W = 0.56

/**
 * Misst einen Symbolknoten samt Beschriftung — von interpret.ts für die
 * ELK-Knotengröße und vom Renderer fürs Zeichnen verwendet, damit beide
 * dieselbe Geometrie sehen (wie layoutNode() für Kastenknoten).
 */
export function measureSymbolNode(symbol: SymbolView, labels: string[]): SymbolBox {
  const lines = labels.filter((l) => l !== '')
  const lineH = symbol.fontSize * LINE_FACTOR
  const textW = lines.reduce((max, l) => Math.max(max, l.length * symbol.fontSize * CHAR_W), 0)
  const textH = lines.length * lineH
  const { width: sw, height: sh, labelPlacement: place } = symbol

  if (place === 'NONE' || place === 'CENTER' || lines.length === 0) {
    return {
      w: Math.max(sw, place === 'CENTER' ? textW + 8 : 0),
      h: sh,
      symbolX: place === 'CENTER' ? Math.max(0, (textW + 8 - sw) / 2) : 0,
      symbolY: 0,
      labelX: Math.max(sw, textW + 8) / 2,
      labelY: sh / 2 + symbol.fontSize * 0.35,
      anchor: 'middle',
    }
  }

  if (place === 'LEFT' || place === 'RIGHT') {
    const gap = 5
    const w = sw + gap + textW
    const h = Math.max(sh, textH)
    const symbolX = place === 'LEFT' ? textW + gap : 0
    return {
      w,
      h,
      symbolX,
      symbolY: (h - sh) / 2,
      labelX: place === 'LEFT' ? textW : sw + gap,
      labelY: (h - textH) / 2 + symbol.fontSize,
      anchor: place === 'LEFT' ? 'end' : 'start',
    }
  }

  // BELOW (Vorgabe) und ABOVE: Beschriftung mittig unter bzw. über dem Symbol
  const gap = 3
  const w = Math.max(sw, textW)
  const h = sh + gap + textH
  const below = place === 'BELOW'
  return {
    w,
    h,
    symbolX: (w - sw) / 2,
    symbolY: below ? 0 : textH + gap,
    labelX: w / 2,
    labelY: (below ? sh + gap : 0) + symbol.fontSize,
    anchor: 'middle',
  }
}
