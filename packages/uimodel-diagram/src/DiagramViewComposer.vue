<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { EObject } from '@emfts/core'
import { useElkLayout } from './useElkLayout'
import { usePanZoom } from './usePanZoom'
import { HEADER_H, ROW_H, NODE_W, resolveNodeView, nodeHeaderColor, layoutNode } from './interpret'
import type { LayoutItem, RowView } from './interpret'
import { routeAllEdges, type NodeRect, type EdgeInput } from './orthogonalRouter'

interface Bracket {
  topY: number
  bottomY: number
  x: number
}

function eGet(obj: EObject, name: string): any {
  const eClass = obj.eClass?.()
  if (!eClass) return undefined
  const feature = eClass.getEStructuralFeature(name)
  if (!feature) return undefined
  return obj.eGet(feature)
}

const props = defineProps<{
  component: EObject  // DiagramView UIModel component
  model: EObject      // Domain object to render
}>()

// The DiagramView component references a DiagramModel (the diagram definition)
// and uses the domain model as the data source.
// Falls back to component/model if not set.
const diagModel = (eGet(props.component, 'diagramModel') ?? props.component) as EObject
const diagRoot = (eGet(props.component, 'diagramRoot') ?? props.model) as EObject

const { laidOut, nodeIndex, edgeMeta, renderVersion, pins, pin, portNodeMap } = useElkLayout(
  diagModel,
  diagRoot,
)
const { view, onWheel, onPanStart, onPanMove, onPanEnd } = usePanZoom()

// Ghost position during drag — only used for the ghost overlay, not for node positions.
const dragPos = reactive(new Map<string, { x: number; y: number }>())
// Parent offset for each node (for converting absolute→relative coords on drop).
const nodeParentOff = reactive(new Map<string, { x: number; y: number }>())
// Parent ID for each node (for hierarchy-aware routing)
const nodeParentId = reactive(new Map<string, string>())

interface RNode {
  id: string
  x: number
  y: number
  w: number
  h: number
  name: string
  stereotype: string
  subtitle: string
  icon: string
  headerColor: string
  items: LayoutItem[]
  container: boolean
  /** Px reserved on the right for default-bracket lines (0 if no brackets). */
  bracketLane: number
}

// Clear drag positions when ELK produces a fresh layout (structural change).
watch(laidOut, () => { dragPos.clear() })

// Walk the (possibly hierarchical) ELK tree, producing render nodes with
// ABSOLUTE coordinates — ELK gives child coords relative to their parent.
const nodes = computed<RNode[]>(() => {
  renderVersion.value // content dependency: re-read EObjects when attributes change
  const g = laidOut.value
  if (!g) return []
  const out: RNode[] = []
  nodeParentOff.clear()
  nodeParentId.clear()
  const walk = (parent: any, offX: number, offY: number, parentNodeId?: string): RNode[] => {
    const level: RNode[] = []
    for (const c of parent.children ?? []) {
      const ref = nodeIndex.value.get(c.id)
      const d = dragPos.get(c.id)
      const x = d?.x ?? offX + (c.x ?? 0)
      const y = d?.y ?? offY + (c.y ?? 0)
      nodeParentOff.set(c.id, { x: offX, y: offY })
      if (parentNodeId) nodeParentId.set(c.id, parentNodeId)
      let rnode: RNode | undefined
      if (ref) {
        const view = resolveNodeView(ref.obj, ref.mapping)
        const nodeItems = layoutNode(view).items
        const bc = countBrackets(nodeItems)
        rnode = {
          id: c.id,
          x,
          y,
          w: c.width ?? NODE_W,
          h: c.height ?? HEADER_H + ROW_H,
          name: view.title,
          stereotype: view.stereotype,
          subtitle: view.subtitle,
          icon: view.icon,
          headerColor: nodeHeaderColor(ref.mapping),
          items: nodeItems,
          container: (c.children?.length ?? 0) > 0,
          bracketLane: bc > 0 ? 6 + bc * 9 : 0,
        }
        out.push(rnode)
        level.push(rnode)
      } else if (c.children?.length) {
        // Synthetic group node (e.g. DATATYPES): no NodeRef, render the ELK label.
        rnode = {
          id: c.id,
          x,
          y,
          w: c.width ?? NODE_W,
          h: c.height ?? HEADER_H,
          name: c.labels?.[0]?.text ?? '',
          stereotype: '',
          subtitle: '',
          icon: '',
          headerColor: '#475569',
          items: [],
          container: true,
          bracketLane: 0,
        }
        out.push(rnode)
        level.push(rnode)
      }
      const kids = walk(c, x, y, c.id) // children positioned relative to this node's origin
      // kids used for container detection only
    }
    return level
  }
  walk(g, 0, 0)

  // Adjust container bounds to encompass all children (including dragged ones)
  const PAD_TOP = 50, PAD_SIDE = 20, PAD_BOTTOM = 20
  const childrenOf = new Map<string, RNode[]>()
  for (const n of out) {
    const pid = nodeParentId.get(n.id)
    if (pid) {
      if (!childrenOf.has(pid)) childrenOf.set(pid, [])
      childrenOf.get(pid)!.push(n)
    }
  }
  // Iterate containers (may be nested, so iterate until stable)
  for (let pass = 0; pass < 3; pass++) {
    for (const c of out) {
      if (!c.container) continue
      const kids = childrenOf.get(c.id)
      if (!kids || kids.length === 0) continue
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const k of kids) {
        minX = Math.min(minX, k.x)
        minY = Math.min(minY, k.y)
        maxX = Math.max(maxX, k.x + k.w)
        maxY = Math.max(maxY, k.y + k.h)
      }
      const needX = minX - PAD_SIDE
      const needY = minY - PAD_TOP
      const needR = maxX + PAD_SIDE
      const needB = maxY + PAD_BOTTOM
      if (needX < c.x) c.x = needX
      if (needY < c.y) c.y = needY
      if (needR > c.x + c.w) c.w = needR - c.x
      if (needB > c.y + c.h) c.h = needB - c.y
    }
  }

  return out
})

// z-order: containers (behind) → edges → leaf nodes (in front), so package
// frames sit under the classes and never cover the edges.
const containerNodes = computed(() => nodes.value.filter((n) => n.container))
const leafNodes = computed(() => nodes.value.filter((n) => !n.container))

/** Cached per-node column layout for table alignment. */
const nodeColsMap = computed(() => {
  const m = new Map<string, NodeCols>()
  for (const n of nodes.value) m.set(n.id, computeNodeCols(n.items, n.w, n.bracketLane))
  return m
})

const nodeById = computed(() => {
  const m = new Map<string, RNode>()
  for (const n of nodes.value) m.set(n.id, n)
  return m
})

/** Count bracket pairs (rows sharing a rowObjId) in a node's items. */
function countBrackets(items: LayoutItem[]): number {
  const counts = new Map<string, number>()
  for (const item of items) {
    if (item.type === 'row' && item.row.rowObjId) {
      counts.set(item.row.rowObjId, (counts.get(item.row.rowObjId) ?? 0) + 1)
    }
  }
  let n = 0
  for (const c of counts.values()) if (c >= 2) n++
  return n
}

/** Global table column layout for a node — uniform across all compartments.
 *  Scans all rows to find the widest icon indent, whether any row has a marker,
 *  the max badge count, etc., then returns fixed column positions. */
interface NodeCols {
  labelX: number    // left edge of label column
  typeX: number     // right edge of type column (text-anchor: end)
  multX: number     // right edge of multiplicity column (text-anchor: end)
  badgeStart: number // left edge of badge cluster
  markerX: number   // center of marker column
}
function computeNodeCols(items: LayoutItem[], w: number, bracketLane: number): NodeCols {
  let hasKey = false, hasOp = false, hasMarker = false, hasMult = false, maxBadges = 0
  for (const item of items) {
    if (item.type === 'row') {
      if (item.row.key) hasKey = true
      if (item.row.op) hasOp = true
      if (item.row.marker) hasMarker = true
      if (item.row.multiplicity) hasMult = true
      if (item.row.badges.length > maxBadges) maxBadges = item.row.badges.length
    }
  }
  const labelX = hasKey ? 20 : hasOp ? 22 : 12
  const R = w - bracketLane - 8
  const markerX = R - 5
  let right = hasMarker ? R - 14 : R
  const badgeStart = right - maxBadges * 13
  if (maxBadges) right = badgeStart - 4
  const multX = right
  const typeX = multX - (hasMult ? 34 : 2)
  return { labelX, typeX, multX, badgeStart, markerX }
}

/** Compute default-brackets for a node: pairs of rows with the same rowObjId
 *  (e.g. an attribute row and its defaults row) connected by a ] bracket.
 *  Brackets render inside the node frame (node is widened to accommodate them). */
function computeBrackets(node: RNode): Bracket[] {
  const byId = new Map<string, number[]>()
  for (const item of node.items) {
    if (item.type === 'row' && item.row.rowObjId) {
      const arr = byId.get(item.row.rowObjId)
      if (arr) arr.push(HEADER_H + item.y + ROW_H / 2)
      else byId.set(item.row.rowObjId, [HEADER_H + item.y + ROW_H / 2])
    }
  }
  const brackets: Bracket[] = []
  let bracketIdx = 0
  for (const positions of byId.values()) {
    if (positions.length >= 2) {
      brackets.push({
        topY: positions[0],
        bottomY: positions[positions.length - 1],
        x: node.w - node.bracketLane + 2 + bracketIdx * 9,
      })
      bracketIdx++
    }
  }
  return brackets
}

const DECO: Record<string, string> = {
  OPEN_ARROW: 'url(#mk-assoc)',
  TRIANGLE_HOLLOW: 'url(#mk-inherit)',
  TRIANGLE_FILLED: 'url(#mk-tri-filled)',
  DIAMOND_HOLLOW: 'url(#mk-diamond-hollow)',
  DIAMOND_FILLED: 'url(#mk-diamond-filled)',
  NONE: '',
}

/** CSS class + start/end markers for an edge, declared in the model (kind + decorations). */
function edgeStyle(meta?: {
  kind?: string
  sourceDecoration?: string
  targetDecoration?: string
}) {
  const kind = meta?.kind ?? ''
  const cls =
    kind === 'INHERITANCE'
      ? 'edge-inherit'
      : kind === 'ASSOCIATION'
        ? 'edge-assoc'
        : kind === 'DEPENDENCY'
          ? 'edge-dep'
          : 'edge-fk'
  let start = DECO[meta?.sourceDecoration ?? ''] ?? ''
  let end = DECO[meta?.targetDecoration ?? ''] ?? ''
  // Fall back to kind-derived target marker only when no decoration is declared.
  if (!meta?.sourceDecoration && !meta?.targetDecoration) {
    if (kind === 'INHERITANCE') end = 'url(#mk-inherit)'
    else if (kind === 'ASSOCIATION' || kind === 'DEPENDENCY') end = 'url(#mk-assoc)'
  }
  return { cls, start, end }
}

const edges = computed(() => {
  const g = laidOut.value
  if (!g) return []

  // Build node rects with parentId for the router
  const root = nodes.value[0]
  const nodeRects: NodeRect[] = nodes.value
    .filter(n => n !== root)
    .map(n => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h, parentId: nodeParentId.get(n.id) }))

  // Build edge inputs from ELK graph
  const elkEdges = (g.edges ?? []) as any[]
  const edgeInputs: EdgeInput[] = elkEdges.map(e => {
    const rawSrcId = e.sources?.[0] as string
    const tgtId = e.targets?.[0] as string
    const srcNodeId = portNodeMap.value.get(rawSrcId) ?? rawSrcId
    const meta = edgeMeta.value.get(e.id)
    return { id: e.id, srcId: srcNodeId, tgtId, sourcePortY: meta?.sourcePortY }
  })

  // Route all edges
  const routes = routeAllEdges(nodeRects, edgeInputs)

  return elkEdges.map((e: any) => {
    const lbl = e.labels?.[0]
    const meta = edgeMeta.value.get(e.id)
    const { cls, start, end } = edgeStyle(meta)
    const sCard = meta?.sourceCardinality ?? ''
    const tCard = meta?.targetCardinality ?? ''
    const route = routes.get(e.id)
    const path = route?.path ?? []
    const sp = path[0] ?? { x: 0, y: 0 }
    const ep = path[path.length - 1] ?? { x: 0, y: 0 }
    const mid = path[Math.floor(path.length / 2)] ?? sp
    return { id: e.id, d: route?.d ?? '', lx: mid.x, ly: mid.y - 8,
      label: lbl?.text ?? '', cls, start, end, sCard, tCard, sp, ep }
  })
})

const viewTransform = computed(() => `translate(${view.x}, ${view.y}) scale(${view.scale})`)

// --- node drag → direct position update (Manhattan re-routes live) ---
let dragging: string | null = null
let startX = 0
let startY = 0
let startNodeX = 0
let startNodeY = 0

function onNodeDown(e: PointerEvent, n: RNode) {
  if (e.button !== 0) return
  if (n.container) return // containers are not directly draggable
  dragging = n.id
  startX = e.clientX
  startY = e.clientY
  startNodeX = n.x
  startNodeY = n.y
  e.stopPropagation()
  window.addEventListener('pointermove', onNodeMove)
  window.addEventListener('pointerup', onNodeUp)
}

function onNodeMove(e: PointerEvent) {
  if (!dragging) return
  let nx = startNodeX + (e.clientX - startX) / view.scale
  let ny = startNodeY + (e.clientY - startY) / view.scale
  const dn = nodeById.value.get(dragging)
  if (dn) {
    const dw = dn.w, dh = dn.h
    const gap = 60 // minimum gap between nodes (protection zone)
    // Push away from all other nodes to prevent overlap + protect stub zones
    for (const other of nodes.value) {
      if (other.id === dragging || other.container) continue
      const ox = other.x, oy = other.y, ow = other.w, oh = other.h
      // Check overlap with gap
      const overlapX = (nx + dw + gap > ox) && (nx < ox + ow + gap)
      const overlapY = (ny + dh + gap > oy) && (ny < oy + oh + gap)
      if (overlapX && overlapY) {
        // Find smallest push direction
        const pushRight = ox + ow + gap - nx
        const pushLeft = nx + dw + gap - ox
        const pushDown = oy + oh + gap - ny
        const pushUp = ny + dh + gap - oy
        const minPush = Math.min(pushRight, pushLeft, pushDown, pushUp)
        if (minPush === pushRight) nx = ox + ow + gap
        else if (minPush === pushLeft) nx = ox - dw - gap
        else if (minPush === pushDown) ny = oy + oh + gap
        else ny = oy - dh - gap
      }
    }
  }
  dragPos.set(dragging, { x: nx, y: ny })
}

function onNodeUp() {
  if (dragging) {
    // dragPos stays as-is — no ELK re-layout needed.
    // The absolute position in dragPos is used directly by the walk function.
    // A structural change (add/remove node) will trigger a fresh ELK layout
    // and dragPos should be cleared at that point.
    dragging = null
  }
  window.removeEventListener('pointermove', onNodeMove)
  window.removeEventListener('pointerup', onNodeUp)
}
</script>

<template>
  <div class="canvas-wrapper">
    <svg
      class="diagram-svg"
      @wheel.prevent="onWheel"
      @pointerdown="onPanStart"
      @pointermove="onPanMove"
      @pointerup="onPanEnd"
    >
      <defs>
        <!-- UML generalization: hollow triangle at the supertype end -->
        <marker id="mk-inherit" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="14"
            markerHeight="14" orient="auto-start-reverse">
          <path d="M1,1 L11,6 L1,11 Z" fill="#fff" stroke="#374151" stroke-width="1.2" />
        </marker>
        <!-- Association: open arrowhead -->
        <marker id="mk-assoc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="11"
            markerHeight="11" orient="auto-start-reverse">
          <path d="M1,1 L9,5 L1,9" fill="none" stroke="#374151" stroke-width="1.4" />
        </marker>
        <!-- Filled triangle -->
        <marker id="mk-tri-filled" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12"
            markerHeight="12" orient="auto-start-reverse">
          <path d="M1,1 L11,6 L1,11 Z" fill="#374151" stroke="#374151" stroke-width="1" />
        </marker>
        <!-- Aggregation: hollow diamond -->
        <marker id="mk-diamond-hollow" viewBox="0 0 16 12" refX="15" refY="6" markerWidth="16"
            markerHeight="12" orient="auto-start-reverse">
          <path d="M1,6 L8,1 L15,6 L8,11 Z" fill="#fff" stroke="#374151" stroke-width="1" />
        </marker>
        <!-- Composition: filled diamond -->
        <marker id="mk-diamond-filled" viewBox="0 0 16 12" refX="15" refY="6" markerWidth="16"
            markerHeight="12" orient="auto-start-reverse">
          <path d="M1,6 L8,1 L15,6 L8,11 Z" fill="#374151" stroke="#374151" stroke-width="1" />
        </marker>
      </defs>

      <g :transform="viewTransform">
        <!-- containers (packages) — rendered first so they stay behind edges + classes -->
        <g
          v-for="node in containerNodes"
          :key="node.id"
          :transform="`translate(${node.x}, ${node.y})`"
          :data-id="node.id"
          class="node"
          @pointerdown="onNodeDown($event, node)"
        >
          <rect class="frame frame-container" x="0" y="0" :width="node.w" :height="node.h" rx="4" ry="4" />
          <rect class="header" x="0" y="0" :width="node.w" :height="HEADER_H" rx="4" ry="4"
            :style="{ fill: node.headerColor, fillOpacity: 0.16 }" />
          <line x1="0" :y1="HEADER_H" :x2="node.w" :y2="HEADER_H" class="header-rule" :style="{ stroke: node.headerColor }" />
          <text v-if="node.icon" x="11" y="22" class="type-icon" :style="{ fill: node.headerColor }">{{ node.icon }}</text>
          <template v-if="node.subtitle">
            <text :x="node.icon ? 28 : 10" y="15" class="title-dark">{{ node.name }}</text>
            <text :x="node.icon ? 28 : 10" y="27" class="subtitle-dim">{{ node.subtitle }}</text>
          </template>
          <template v-else-if="node.stereotype">
            <text :x="node.icon ? 28 : 10" y="14" class="kind">{{ node.stereotype }}</text>
            <text :x="node.icon ? 28 : 10" y="27" class="title-dark">{{ node.name }}</text>
          </template>
          <text v-else :x="node.icon ? 28 : 10" y="21" class="title-dark">{{ node.name }}</text>
        </g>

        <!-- edges — above containers, below leaf nodes -->
        <g v-for="edge in edges" :key="edge.id" class="edge">
          <path
            :d="edge.d"
            class="edge-line"
            :class="edge.cls"
            :marker-start="edge.start || undefined"
            :marker-end="edge.end || undefined"
          />
          <text v-if="edge.label" :x="edge.lx" :y="edge.ly" class="edge-label">{{ edge.label }}</text>
          <text v-if="edge.sCard" :x="edge.sp.x + 6" :y="edge.sp.y - 4" class="edge-card">{{ edge.sCard }}</text>
          <text v-if="edge.tCard" :x="edge.ep.x + 6" :y="edge.ep.y - 4" class="edge-card">{{ edge.tCard }}</text>
        </g>

        <!-- leaf nodes (classes/tables) — rendered last so they sit on top -->
        <g
          v-for="node in leafNodes"
          :key="node.id"
          :transform="`translate(${node.x}, ${node.y})`"
          :data-id="node.id"
          class="node"
          @pointerdown="onNodeDown($event, node)"
        >
          <rect class="frame" x="0" y="0" :width="node.w" :height="node.h" rx="4" ry="4" />
          <rect class="header" x="0" y="0" :width="node.w" :height="HEADER_H" rx="4" ry="4"
            :style="{ fill: node.headerColor, fillOpacity: 0.16 }" />
          <line x1="0" :y1="HEADER_H" :x2="node.w" :y2="HEADER_H" class="header-rule" :style="{ stroke: node.headerColor }" />
          <text v-if="node.icon" x="11" y="22" class="type-icon" :style="{ fill: node.headerColor }">{{ node.icon }}</text>
          <template v-if="node.subtitle">
            <text :x="node.icon ? 28 : 10" y="15" class="title-dark">{{ node.name }}</text>
            <text :x="node.icon ? 28 : 10" y="27" class="subtitle-dim">{{ node.subtitle }}</text>
          </template>
          <template v-else-if="node.stereotype">
            <text :x="node.icon ? 28 : 10" y="14" class="kind">{{ node.stereotype }}</text>
            <text :x="node.icon ? 28 : 10" y="27" class="title-dark">{{ node.name }}</text>
          </template>
          <text v-else :x="node.icon ? 28 : 10" y="21" class="title-dark">{{ node.name }}</text>

          <g v-for="(item, idx) in node.items" :key="idx" :transform="`translate(0, ${HEADER_H + item.y})`">
            <!-- compartment section header -->
            <template v-if="item.type === 'title'">
              <line v-if="item.sep" x1="0" y1="0" :x2="node.w" y2="0" class="compartment-sep" />
              <rect x="1" y="0" :width="node.w - 2" :height="item.h" class="section-band" />
              <text x="10" y="11" class="section-title">{{ item.title }}</text>
            </template>

            <!-- nested sub-row (operation parameter) -->
            <template v-else-if="item.type === 'subrow'">
              <text x="26" y="12" class="col-sub">• {{ item.sub.label }}</text>
              <text :x="nodeColsMap.get(node.id)!.typeX" y="12" text-anchor="end" class="col-sub-type">{{ item.sub.detail }}</text>
              <text v-if="item.sub.multiplicity" :x="nodeColsMap.get(node.id)!.multX" y="12" text-anchor="end" class="col-mult">{{ item.sub.multiplicity }}</text>
            </template>

            <!-- regular row -->
            <template v-else>
              <line v-if="item.sep" x1="0" y1="0" :x2="node.w" y2="0" class="compartment-sep" />
              <text v-if="item.row.key" x="6" y="14" class="key-icon">⚷</text>
              <text v-if="item.row.op" x="11" y="14" class="op-icon">ƒ</text>
              <text :x="nodeColsMap.get(node.id)!.labelX" y="14" class="col">{{ item.row.label }}</text>
              <text :x="nodeColsMap.get(node.id)!.typeX" y="14" text-anchor="end" class="col-type">{{ item.row.detail }}</text>
              <text v-if="item.row.multiplicity" :x="nodeColsMap.get(node.id)!.multX" y="14" text-anchor="end" class="col-mult">{{ item.row.multiplicity }}</text>
              <g v-for="(b, bi) in item.row.badges" :key="bi">
                <rect :x="nodeColsMap.get(node.id)!.badgeStart + bi * 13" y="3" width="11" height="13" rx="2" class="flag-box" />
                <text :x="nodeColsMap.get(node.id)!.badgeStart + bi * 13 + 5.5" y="13" text-anchor="middle" class="flag-text">{{ b }}</text>
              </g>
              <text v-if="item.row.marker" :x="nodeColsMap.get(node.id)!.markerX" y="15" text-anchor="middle" class="ref-marker">{{ item.row.marker === 'diamond' ? '◆' : '›' }}</text>
            </template>
          </g>

          <!-- Default brackets: ] connecting attribute row to its default row -->
          <g v-for="(br, bi) in computeBrackets(node)" :key="`br-${bi}`" class="bracket">
            <path
              :d="`M${br.x},${br.topY} L${br.x + 4},${br.topY} L${br.x + 4},${br.bottomY} L${br.x},${br.bottomY}`"
              class="bracket-line"
            />
            <circle :cx="br.x" :cy="br.topY" r="1.6" class="bracket-dot" />
            <circle :cx="br.x" :cy="br.bottomY" r="1.6" class="bracket-dot" />
          </g>
        </g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.canvas-wrapper {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}
.diagram-svg {
  width: 100%;
  height: 100%;
  cursor: grab;
  background: #f8fafc;
}
.node {
  cursor: move;
}
.node:hover .frame {
  filter: drop-shadow(0 2px 6px rgba(59, 130, 246, 0.35));
}
.frame {
  fill: #fff;
  stroke: #374151;
  stroke-width: 1;
}
.frame-container {
  fill: #f8fafc;
  stroke: #94a3b8;
  stroke-dasharray: 4 3;
}
.header {
  fill: #e2e8f0;
}
.header-rule {
  stroke-width: 1;
}
.type-icon {
  font: 12px sans-serif;
}
.title-dark {
  font: 600 13px sans-serif;
  fill: #1f2937;
}
.kind {
  font: 9px sans-serif;
  fill: #6b7280;
  letter-spacing: 0.3px;
}
.subtitle-dim {
  font: 9px monospace;
  fill: #64748b;
}
/* Compartment section header (ATTRIBUTES / REFERENCES / …) */
.section-band {
  fill: #f1f5f9;
}
.section-title {
  font: 700 8px sans-serif;
  fill: #64748b;
  letter-spacing: 0.6px;
}
.compartment-sep {
  stroke: #374151;
  stroke-width: 1;
}
.col {
  font: 11px sans-serif;
  fill: #111827;
}
.key-icon {
  font: 11px sans-serif;
  fill: #d97706;
}
.op-icon {
  font: italic 700 11px serif;
  fill: #7c3aed;
}
.col-type {
  font: 10px monospace;
  fill: #6b7280;
}
.col-sub {
  font: italic 10px sans-serif;
  fill: #6b7280;
}
.col-sub-type {
  font: 9px monospace;
  fill: #94a3b8;
}
.col-mult {
  font: 10px monospace;
  fill: #9ca3af;
}
/* Flag badges (derived / transient / volatile / default) as small boxes */
.flag-box {
  fill: #fef3c7;
  stroke: #f59e0b;
  stroke-width: 0.7;
}
.flag-text {
  font: 700 8px monospace;
  fill: #b45309;
}
.ref-marker {
  font: 11px sans-serif;
  fill: #374151;
}
.edge-line {
  fill: none;
  stroke: #374151;
  stroke-width: 1.4;
}
/* Per-kind edge styling — like the daanse showcase, all edges are slate-gray
   and distinguished only by their end markers (triangle / arrow / diamond). */
.edge-inherit {
  stroke: #374151;
}
.edge-assoc {
  stroke: #374151;
}
.edge-dep {
  stroke: #6b7280;
  stroke-dasharray: 5 3;
}
.edge-fk {
  stroke: #374151;
}
.edge-label {
  font: 10px sans-serif;
  fill: #1e293b;
}
.edge-card {
  font: 9px monospace;
  fill: #475569;
}
/* Default brackets connecting attribute rows to their default-value rows */
.bracket-line {
  fill: none;
  stroke: #6b7280;
  stroke-width: 1.4;
  stroke-linecap: round;
}
.bracket-dot {
  fill: #6b7280;
}
/* Drag ghost: semi-transparent preview of the node at its target position */
.drag-ghost rect {
  fill: #3b82f6;
  fill-opacity: 0.15;
  stroke: #3b82f6;
  stroke-width: 1.5;
  stroke-dasharray: 4 3;
}
.drag-ghost .title-dark {
  fill: #3b82f6;
  opacity: 0.6;
}
</style>
