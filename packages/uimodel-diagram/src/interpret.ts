/**
 * Generic, model-driven projection: (DiagramModel, domainRoot) → ELK graph.
 *
 * The DiagramModel (instance of diagrammodel.ecore) binds to the domain via
 * TYPED Ecore references: `labelFeature`/`detailFeature`/`whenFeature` are
 * ecore::EStructuralFeature refs, and `from`/`fromPath`/`sourcePath`/`targetPath`
 * are ordered lists of ecore::EReference (traversal paths). The interpreter
 * reads values with obj.eGet(feature) directly — no string lookups, no
 * per-domain code. Swap the DiagramModel to render a different domain.
 */
import {
  EcoreUtil,
  type EObject,
  type EStructuralFeature,
  type EReference,
  type EList,
} from '@emfts/core'
import type { ElkNode } from 'elkjs/lib/elk.bundled.js'
import { evaluateBoolean } from '@emfts/uimodel-composer'
import { Grouper, type FrameRef } from './grouping'
import {
  COMPARTMENT_SYMBOL,
  measureSymbolNode,
  resolveEdgeSymbol,
  resolveNodeSymbol,
  type EdgeSymbolView,
  type SymbolView,
} from './symbology'

/** Read a single-valued feature by name. */
function get(o: EObject, name: string): any {
  const f = o.eClass().getEStructuralFeature(name)
  if (!f) throw new Error(`No feature "${name}" on ${o.eClass().getName()}`)
  return o.eGet(f)
}

/** Read a multi-valued feature as a plain array. */
function items(o: EObject, name: string): EObject[] {
  return (get(o, name) as EList<EObject>).toArray()
}

export const HEADER_H = 34
export const ROW_H = 20
export const SUBROW_H = 16
export const TITLE_H = 16
export const NODE_W = 220

export interface NodeRef {
  obj: EObject
  mapping: EObject
}
export interface EdgeMeta {
  kind: string
  /** Farbe, Breite und Strichart aus dem EdgeRenderer. */
  symbol: EdgeSymbolView
  sourceCardinality: string
  targetCardinality: string
  sourceDecoration: string
  targetDecoration: string
  /** Y center of the source row within the source node (for row-anchored edges). */
  sourcePortY?: number
}
export interface InterpretResult {
  graph: ElkNode
  index: Map<string, NodeRef>
  /** edge id → kind/cardinalities (ELK edges carry no domain metadata). */
  edgeMeta: Map<string, EdgeMeta>
  /** port id → node id (for resolving port-based edge sources back to nodes). */
  portNodeMap: Map<string, string>
  /** frame id → the NodeGrouping and group object behind it. */
  frames: Map<string, FrameRef>
}
export interface SubRowView {
  label: string
  detail: string
  multiplicity: string
}
export interface RowView {
  label: string
  detail: string
  multiplicity: string
  badges: string[]
  subRows: SubRowView[]
  /** Operation row → render a leading ƒ glyph and a `(…)` signature. */
  op: boolean
  /** Identity/key attribute → render a leading key icon. */
  key: boolean
  /** Trailing edge marker for reference rows: 'diamond' (containment) | 'arrow' | ''. */
  marker: string
  /** Stable id of the domain object this row represents (for port/bracket matching). */
  rowObjId: string
}
export interface CompartmentView {
  separator: boolean
  /** Uppercase section header (e.g. ATTRIBUTES), or '' for none. */
  title: string
  rows: RowView[]
}
export interface NodeView {
  title: string
  /** Second label line, e.g. a device's first IP address, or ''. */
  sublabel: string
  stereotype: string
  /** Small subtitle under the title (e.g. EPackage.nsURI), or ''. */
  subtitle: string
  /** Type-icon glyph for the header, or ''. */
  icon: string
  compartments: CompartmentView[]
}

/** A positioned render item produced by layoutNode() — used both to size the
 *  ELK node and to place rows in the renderer, keeping the two in sync.
 *  Discriminated on `type` so the renderer template narrows row/sub safely. */
export type LayoutItem =
  | { type: 'title'; y: number; h: number; title: string; sep: boolean }
  | { type: 'row'; y: number; h: number; row: RowView; sep: boolean }
  | { type: 'subrow'; y: number; h: number; sub: SubRowView }

export function nodeId(o: EObject): string {
  // Prefer the resource-relative fragment (unique per object); fall back to the
  // full URI. Never fall back to the metaclass name — that collides across all
  // instances of a type (e.g. every EClass → "EClass").
  const res = (o as { eResource?: () => { getURIFragment?: (e: EObject) => string } | null }).eResource?.()
  if (res?.getURIFragment) {
    try {
      const frag = res.getURIFragment(o)
      if (frag) return frag
    } catch {
      /* fall through */
    }
  }
  const uri = EcoreUtil.getURI(o)?.toString()
  if (uri) return uri
  // Fallback (e.g. loaded .ecore where fragments come back empty): qualified
  // name built from the containment chain — unique and stable.
  const parts: string[] = []
  for (
    let cur: EObject | null | undefined = o;
    cur && typeof (cur as { eClass?: unknown }).eClass === 'function';
    cur = cur.eContainer?.()
  ) {
    const nf = cur.eClass().getEStructuralFeature('name')
    const nm = nf ? cur.eGet(nf) : null
    parts.unshift(nm != null && nm !== '' ? String(nm) : '_')
  }
  return parts.join('/')
}

function truthy(v: unknown): boolean {
  return v === true || v === 'true' || (typeof v === 'number' && v !== 0)
}

/** Resolve a cross-reference proxy (e.g. an href into the domain metamodel). */
function deproxy<T extends EObject>(o: T | null | undefined, ctx: EObject): T | undefined {
  if (!o) return undefined
  return (typeof o.eIsProxy === 'function' && o.eIsProxy() ? EcoreUtil.resolve(o, ctx) : o) as T
}

/** A single resolved EStructuralFeature reference held by a mapping object. */
function featureOf(mappingObj: EObject, name: string): EStructuralFeature | undefined {
  return deproxy(get(mappingObj, name) as EObject | undefined, mappingObj) as
    | EStructuralFeature
    | undefined
}

/** An ordered list of resolved EStructuralFeature references held by a mapping object. */
function featuresOf(mappingObj: EObject, name: string): EStructuralFeature[] {
  return items(mappingObj, name)
    .map((f) => deproxy(f, mappingObj))
    .filter(Boolean) as EStructuralFeature[]
}

/** An ordered list of resolved EReferences (a traversal path) held by a mapping object. */
function pathOf(mappingObj: EObject, name: string): EReference[] {
  return items(mappingObj, name)
    .map((r) => deproxy(r, mappingObj))
    .filter(Boolean) as EReference[]
}

/** Read a scalar value off a domain object via a resolved feature ref. A
 *  reference value (an EObject, e.g. an EAttribute's eType) renders as its name;
 *  a multi-valued feature (e.g. Device.ips) as its values joined by ', '. */
function readScalar(obj: EObject, feature: EStructuralFeature | undefined): string {
  if (!feature) return ''
  let v: unknown
  try {
    v = obj.eGet(feature)
  } catch {
    return ''
  }
  return renderValue(v, obj)
}

function renderValue(v: unknown, obj: EObject): string {
  if (v == null) return ''
  if (typeof (v as { eClass?: unknown }).eClass === 'function') {
    const ref = deproxy(v as EObject, obj)
    const nf = ref?.eClass().getEStructuralFeature('name')
    return nf ? String(ref!.eGet(nf) ?? '') : ''
  }
  const many = Array.isArray(v)
    ? (v as unknown[])
    : typeof (v as { toArray?: unknown }).toArray === 'function'
      ? (v as { toArray(): unknown[] }).toArray()
      : null
  if (many) return many.map((item) => renderValue(item, obj)).filter(Boolean).join(', ')
  return String(v)
}

/** Follow an ordered path of EReferences, flat-mapping multi-valued steps.
 *  Tolerant: a feature not applicable to an object (e.g. eSuperTypes on an
 *  EEnum) yields nothing instead of throwing. */
function follow(start: EObject, path: EReference[]): EObject[] {
  let current: EObject[] = [start]
  for (const ref of path) {
    current = current.flatMap((o) => {
      let v: unknown
      try {
        v = o.eGet(ref)
      } catch {
        return []
      }
      if (v == null) return []
      const arr = Array.isArray(v)
        ? (v as EObject[])
        : typeof (v as { toArray?: unknown }).toArray === 'function'
          ? (v as { toArray(): EObject[] }).toArray()
          : [v as EObject]
      return arr.map((x) => deproxy(x, o)).filter(Boolean) as EObject[]
    })
  }
  return current
}

/** Walk the containment chain (incl. self) to the nearest object that has a node. */
function nodeContaining(obj: EObject | null | undefined, index: Map<string, NodeRef>): string | null {
  let cur: EObject | null | undefined = obj
  while (cur && typeof (cur as { eClass?: unknown }).eClass === 'function') {
    const id = nodeId(cur)
    if (index.has(id)) return id
    cur = cur.eContainer?.()
  }
  return null
}

/** Format an EMF multiplicity off a typed element via the comp's bound features. */
function multiplicityOf(
  r: EObject,
  lowerF: EStructuralFeature | undefined,
  upperF: EStructuralFeature | undefined,
): string {
  if (!lowerF && !upperF) return ''
  return formatMultiplicity(lowerF ? r.eGet(lowerF) : null, upperF ? r.eGet(upperF) : null)
}

/** Resolve the visible content of a node from its NodeMapping + domain object. */
export function resolveNodeView(obj: EObject, mapping: EObject): NodeView {
  const title = readScalar(obj, featureOf(mapping, 'labelFeature'))
  const sublabel = readScalar(obj, featureOf(mapping, 'sublabelFeature'))
  const stereotype = String(get(mapping, 'stereotype') ?? '')
  const subtitle = readScalar(obj, featureOf(mapping, 'subtitleFeature'))
  const icon = String(get(mapping, 'icon') ?? '')
  const compartments: CompartmentView[] = []
  for (const comp of items(mapping, 'compartments')) {
    const labelFeature = featureOf(comp, 'labelFeature')
    const detailFeature = featureOf(comp, 'detailFeature')
    const lowerF = featureOf(comp, 'lowerBoundFeature')
    const upperF = featureOf(comp, 'upperBoundFeature')
    const subFromPath = pathOf(comp, 'subFrom')
    const subLabelF = featureOf(comp, 'subLabelFeature')
    const subDetailF = featureOf(comp, 'subDetailFeature')
    const separator = truthy(get(comp, 'separator'))
    const title = String(get(comp, 'title') ?? '')
    const badges = items(comp, 'badges')
    const keyF = featureOf(comp, 'keyFeature')
    const markerF = featureOf(comp, 'markerFeature')
    const rowCond = get(comp, 'rowCondition') as EObject | undefined | null
    // Optional metaclass filter for rows (e.g. only EAttribute, only EReference).
    const rowSC = deproxy(get(comp, 'sourceClass') as EObject | undefined, comp)
    const rowSCName = rowSC ? String(get(rowSC, 'name') ?? '') : ''
    // A compartment with subFrom is "callable" (operations): the row shows a
    // `name(…)` signature, the return type/multiplicity stays in the detail
    // column, and each parameter becomes an indented sub-row.
    const callable = subFromPath.length > 0
    const rows: RowView[] = follow(obj, pathOf(comp, 'from'))
      .filter((r) => !rowSCName || r.eClass().getName() === rowSCName)
      .filter(
        (r) =>
          !rowCond ||
          evaluateBoolean(
            { language: String(get(rowCond, 'language') ?? ''), body: String(get(rowCond, 'body') ?? '') } as any,
            r,
          ),
      )
      .map((r) => {
        const base = readScalar(r, labelFeature)
        const subRows: SubRowView[] = callable
          ? follow(r, subFromPath).map((sr) => ({
              label: readScalar(sr, subLabelF),
              detail: readScalar(sr, subDetailF),
              multiplicity: multiplicityOf(sr, lowerF, upperF),
            }))
          : []
        return {
          label: callable ? `${base}(${subRows.length ? '…' : ''})` : base,
          detail: readScalar(r, detailFeature),
          multiplicity: multiplicityOf(r, lowerF, upperF),
          badges: badges
            // A badge without a whenFeature always shows (e.g. the DEFAULTS "D");
            // otherwise it shows only when its boolean feature is truthy.
            .filter((b) => {
              const wf = featureOf(b, 'whenFeature')
              return !wf || truthy(readScalar(r, wf))
            })
            .map((b) => String(get(b, 'icon'))),
          subRows,
          op: callable,
          key: keyF ? truthy(readScalar(r, keyF)) : false,
          marker: markerF ? (truthy(readScalar(r, markerF)) ? 'diamond' : 'arrow') : '',
          rowObjId: nodeId(r),
        }
      })
    if (rows.length) compartments.push({ separator, title, rows })
  }
  return { title, sublabel, stereotype, subtitle, icon, compartments }
}

/** Lay out a node's compartments into positioned items (title bands, rows,
 *  sub-rows) and return the total content height below the header. Used by
 *  both the ELK sizing (here) and the renderer, so geometry stays in sync. */
export function layoutNode(view: NodeView): { items: LayoutItem[]; height: number } {
  const items: LayoutItem[] = []
  let y = 0
  for (const comp of view.compartments) {
    if (comp.title) {
      items.push({ type: 'title', y, h: TITLE_H, title: comp.title, sep: comp.separator })
      y += TITLE_H
    }
    comp.rows.forEach((r, ri) => {
      items.push({ type: 'row', y, h: ROW_H, row: r, sep: !comp.title && comp.separator && ri === 0 })
      y += ROW_H
      r.subRows.forEach((sr) => {
        items.push({ type: 'subrow', y, h: SUBROW_H, sub: sr })
        y += SUBROW_H
      })
    })
  }
  return { items, height: Math.max(ROW_H, y) }
}

/** Format an EMF multiplicity as "lower..upper" (upper -1 → *). */
function formatMultiplicity(lowVal: unknown, upVal: unknown): string {
  const hasLow = lowVal !== null && lowVal !== undefined && lowVal !== ''
  const hasUp = upVal !== null && upVal !== undefined && upVal !== ''
  if (!hasLow && !hasUp) return ''
  const low = hasLow ? String(Number(lowVal)) : '0'
  const upN = hasUp ? Number(upVal) : -1
  return `${low}..${upN === -1 ? '*' : upN}`
}

export function rowCount(view: NodeView): number {
  return view.compartments.reduce(
    (n, c) => n + c.rows.reduce((m, r) => m + 1 + r.subRows.length, 0),
    0,
  )
}

/** Header colour declared on the NodeMapping's style, if any. */
export function nodeHeaderColor(mapping: EObject): string {
  const style = deproxy(get(mapping, 'style') as EObject | undefined, mapping)
  return style ? String(get(style, 'headerColor') ?? '#1e3a8a') : '#1e3a8a'
}

/** The side-effect maps that buildNodes fills while walking the mappings. */
interface BuildCtx {
  index: Map<string, NodeRef>
  portNodeMap: Map<string, string>
  rowYMap: Map<string, number>
  grouper: Grouper
}

/** The effective symbol of a node, as declared by its NodeMapping's renderer. */
export function nodeSymbolOf(obj: EObject, mapping: EObject): SymbolView {
  return resolveNodeSymbol(obj, deproxy(get(mapping, 'renderer') as EObject | undefined, mapping))
}

/** The ELK padding a container node uses to leave room for its title. */
function containerLayout(): Record<string, string> {
  return {
    'elk.padding': `[top=${HEADER_H + 16},left=20,bottom=20,right=20]`,
    'elk.spacing.nodeNode': '80',
    'elk.layered.spacing.nodeNodeBetweenLayers': '100',
  }
}

/** Build ELK nodes for a set of NodeMappings relative to a parent domain object.
 *  A mapping with `children` becomes a container (size computed by ELK).
 *  A mapping whose renderer declares a shape other than COMPARTMENTS becomes a
 *  symbol node of fixed size, measured together with its label.
 *  A mapping with `groupings` does not return its nodes: they go into the frame
 *  the Grouper builds for them, which lands on the top level.
 *  portNodeMap/rowYMap are populated as a side-effect for later port placement. */
function buildNodes(
  mappings: EObject[],
  parentObj: EObject,
  ctx: BuildCtx,
): NonNullable<ElkNode['children']> {
  const out: NonNullable<ElkNode['children']> = []
  const emit = (node: NonNullable<ElkNode['children']>[number], frameId: string | null) => {
    if (frameId) ctx.grouper.place(frameId, node)
    else out.push(node)
  }

  for (const nm of mappings) {
    // Group node: a synthetic visual bucket (no domain object). Its children are
    // built from the SAME parent object; it is keyed stably off the parent.
    if (truthy(get(nm, 'group'))) {
      const groupChildren = buildNodes(items(nm, 'children'), parentObj, ctx)
      if (groupChildren.length) {
        out.push({
          id: `${nodeId(parentObj)}::${String(get(nm, 'name') ?? 'group')}`,
          labels: [{ text: String(get(nm, 'groupLabel') ?? '') }],
          children: groupChildren,
          layoutOptions: containerLayout(),
        })
      }
      continue
    }
    const condition = get(nm, 'condition') as EObject | undefined | null
    // Optional metaclass filter (e.g. only EEnum, only EDataType).
    const sc = deproxy(get(nm, 'sourceClass') as EObject | undefined, nm)
    const sourceClassName = sc ? String(get(sc, 'name') ?? '') : ''
    const renderer = deproxy(get(nm, 'renderer') as EObject | undefined, nm)
    const groupings = items(nm, 'groupings')
      .map((g) => deproxy(g, nm))
      .filter(Boolean) as EObject[]

    for (const obj of follow(parentObj, pathOf(nm, 'from'))) {
      if (sourceClassName && obj.eClass().getName() !== sourceClassName) continue
      // Optional filter: skip objects that don't satisfy the NodeMapping condition.
      if (condition && !evaluateBoolean(
        { language: String(get(condition, 'language') ?? ''), body: String(get(condition, 'body') ?? '') } as any,
        obj,
      )) {
        continue
      }
      const id = nodeId(obj)
      ctx.index.set(id, { obj, mapping: nm })
      const view = resolveNodeView(obj, nm)
      const childNodes = buildNodes(items(nm, 'children'), obj, ctx)
      const frameId = ctx.grouper.frameFor(obj, groupings)

      if (childNodes.length) {
        // Container: ELK sizes it to fit children; padding leaves room for the title.
        emit({
          id,
          labels: [{ text: view.title }],
          children: childNodes,
          layoutOptions: containerLayout(),
        }, frameId)
        continue
      }

      const symbol = resolveNodeSymbol(obj, renderer)
      if (symbol.shape !== 'COMPARTMENTS') {
        // Symbol node: fixed size from the symbol, widened for its label.
        const box = measureSymbolNode(symbol, [view.title, view.sublabel])
        emit({ id, width: box.w, height: box.h, labels: [{ text: view.title }] }, frameId)
        continue
      }

      // Box node: height from the compartment rows, width fixed plus bracket lane.
      // Record row Y positions for port placement (first occurrence only per rowObjId).
      // Also count bracket pairs (rows with same rowObjId) for extra width.
      let bracketCount = 0
      const lay = layoutNode(view)
      const seen = new Set<string>()
      const rowIdCounts = new Map<string, number>()
      for (const item of lay.items) {
        if (item.type === 'row' && item.row.rowObjId) {
          rowIdCounts.set(item.row.rowObjId, (rowIdCounts.get(item.row.rowObjId) ?? 0) + 1)
          if (!seen.has(item.row.rowObjId)) {
            seen.add(item.row.rowObjId)
            const portId = `${id}__port__${item.row.rowObjId}`
            const yCenter = HEADER_H + item.y + ROW_H / 2
            ctx.portNodeMap.set(portId, id)
            ctx.rowYMap.set(portId, yCenter)
          }
        }
      }
      for (const c of rowIdCounts.values()) if (c >= 2) bracketCount++
      // Extra width so bracket lines fit inside the widened node frame.
      const bracketExtra = bracketCount > 0 ? 10 + bracketCount * 9 : 0

      emit({
        id,
        width: COMPARTMENT_SYMBOL.width + bracketExtra,
        height: HEADER_H + lay.height,
        labels: [{ text: view.title }],
      }, frameId)
    }
  }
  return out
}

export function interpret(model: EObject, root: EObject): InterpretResult {
  const index = new Map<string, NodeRef>()
  const portNodeMap = new Map<string, string>()
  const rowYMap = new Map<string, number>()
  const grouper = new Grouper(root, { get, items, featureOf, pathOf, featuresOf, follow })
  const ctx: BuildCtx = { index, portNodeMap, rowYMap, grouper }
  // Nodes that fall into a frame are placed there by the Grouper; what comes
  // back here are the nodes that belong on the top level directly.
  const children = [...buildNodes(items(model, 'nodes'), root, ctx), ...grouper.roots()]

  const edges: NonNullable<ElkNode['edges']> = []
  const edgeMeta = new Map<string, EdgeMeta>()
  const usedPorts = new Set<string>()
  for (const em of items(model, 'edges')) {
    const sourcePath = pathOf(em, 'sourcePath')
    const targetPath = pathOf(em, 'targetPath')
    const labelFeature = featureOf(em, 'labelFeature')
    const kind = String(get(em, 'kind') ?? '')
    const sourceCardinality = String(get(em, 'sourceCardinality') ?? '')
    const targetCardinality = String(get(em, 'targetCardinality') ?? '')
    const sourceDecoration = String(get(em, 'sourceDecoration') ?? '')
    const targetDecoration = String(get(em, 'targetDecoration') ?? '')
    const edgeSC = deproxy(get(em, 'sourceClass') as EObject | undefined, em)
    const edgeSCName = edgeSC ? String(get(edgeSC, 'name') ?? '') : ''
    const edgeRenderer = deproxy(get(em, 'renderer') as EObject | undefined, em)
    const edgeCond = get(em, 'condition') as EObject | undefined | null
    for (const e of follow(root, pathOf(em, 'fromPath'))) {
      if (edgeSCName && e.eClass().getName() !== edgeSCName) continue
      if (edgeCond && !evaluateBoolean(
        { language: String(get(edgeCond, 'language') ?? ''), body: String(get(edgeCond, 'body') ?? '') } as any,
        e,
      )) {
        continue
      }
      const symbol = resolveEdgeSymbol(e, edgeRenderer)
      // No sourcePath → the edge object itself is the source (e.g. inheritance).
      const srcObj = sourcePath.length ? (follow(e, sourcePath)[0] ?? null) : e
      const srcNode = nodeContaining(srcObj, index)
      if (!srcNode) continue
      const label = labelFeature ? readScalar(e, labelFeature) : ''
      // Look up source port (row-anchored edge)
      const portId = `${srcNode}__port__${nodeId(e)}`
      const hasPort = portNodeMap.has(portId)
      follow(e, targetPath).forEach((tObj, i) => {
        const tgtNode = nodeContaining(tObj, index)
        if (!tgtNode) return
        const id = `${nodeId(e)}#${i}`
        const usePort = hasPort && tgtNode !== srcNode // avoid self-loop ports
        if (usePort) usedPorts.add(portId)
        edges.push({
          id,
          sources: [usePort ? portId : srcNode],
          targets: [tgtNode],
          labels: label ? [{ text: label, width: label.length * 6 + 4, height: 12 }] : [],
        })
        edgeMeta.set(id, {
          kind,
          symbol,
          sourceCardinality,
          targetCardinality,
          sourceDecoration,
          targetDecoration,
          sourcePortY: usePort ? rowYMap.get(portId) : undefined,
        })
      })
    }
  }

  // Add ELK ports to nodes that actually have edges starting from rows.
  const elkNodeMap = new Map<string, Record<string, unknown>>()
  function indexElkChildren(ch: NonNullable<ElkNode['children']>) {
    for (const c of ch) {
      elkNodeMap.set(c.id, c as unknown as Record<string, unknown>)
      if (c.children) indexElkChildren(c.children)
    }
  }
  indexElkChildren(children)
  for (const pid of usedPorts) {
    const nid = portNodeMap.get(pid)!
    const node = elkNodeMap.get(nid)
    if (!node) continue
    const ports = (node.ports ?? []) as { id: string; x: number; y: number; width: number; height: number }[]
    ports.push({ id: pid, x: (node.width as number) ?? NODE_W, y: rowYMap.get(pid)!, width: 0, height: 0 })
    node.ports = ports
    node.layoutOptions = { ...((node.layoutOptions as Record<string, string>) ?? {}), 'elk.portConstraints': 'FIXED_POS' }
  }

  const layoutOptions: Record<string, string> = {}
  for (const opt of items(model, 'layoutOptions')) {
    layoutOptions[String(get(opt, 'key'))] = String(get(opt, 'value'))
  }

  return {
    graph: { id: 'root', layoutOptions, children, edges },
    index,
    edgeMeta,
    portNodeMap,
    frames: grouper.frames,
  }
}
