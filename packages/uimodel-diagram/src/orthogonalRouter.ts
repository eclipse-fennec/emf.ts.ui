/**
 * Edge routing adapter using tsrouter (OrthogonalRouter).
 *
 * Routes ALL edges in a single tsrouter pass for overlap/crossing avoidance.
 * Uses hierarchy-aware obstacle filtering via parentId containment chains.
 */
import { OrthogonalRouter } from '@emfts/tsrouter'
import type { NodeRect as TsNodeRect, Port } from '@emfts/tsrouter'

export interface Point { x: number; y: number }
export interface NodeRect {
  id: string
  x: number; y: number; w: number; h: number
  parentId?: string
}
export interface EdgeInput {
  id: string
  srcId: string
  tgtId: string
  sourcePortY?: number
}
export interface EdgeRoute {
  path: Point[]
  d: string
}

const HEADER_HEIGHT = 34  // match HEADER_H, smaller than the padding gap

export function routeAllEdges(
  nodes: NodeRect[],
  edges: EdgeInput[],
): Map<string, EdgeRoute> {
  const nodeMap = new Map<string, NodeRect>()
  for (const n of nodes) nodeMap.set(n.id, n)

  // Determine containers
  const isContainer = new Set<string>()
  for (const n of nodes) {
    if (n.parentId) isContainer.add(n.parentId)
  }

  // Ancestors helper
  function getAncestors(nodeId: string): Set<string> {
    const anc = new Set<string>()
    let cur = nodeMap.get(nodeId)
    while (cur?.parentId) {
      anc.add(cur.parentId)
      cur = nodeMap.get(cur.parentId)
    }
    return anc
  }

  // Collect ALL permeable packages across all edges
  const globalPermeable = new Set<string>()
  for (const edge of edges) {
    const srcAnc = getAncestors(edge.srcId)
    const tgtAnc = getAncestors(edge.tgtId)
    for (const a of srcAnc) globalPermeable.add(a)
    for (const a of tgtAnc) globalPermeable.add(a)
    globalPermeable.add(edge.srcId)
    globalPermeable.add(edge.tgtId)
  }

  // Build ONE router with all obstacles + all ports
  const router = new OrthogonalRouter({
    margin: 20,
    bendPenalty: 50,
    allowCrossings: true,
    crossingPenalty: 100,
    allowOverlap: false,
    nudgeDistance: 8,
    lineMargin: 8,
  })

  // Track which nodes we've added
  const addedNodes = new Set<string>()

  // Add all non-permeable nodes as obstacles (no ports)
  for (const n of nodes) {
    if (globalPermeable.has(n.id)) continue
    router.addNode({
      id: n.id,
      rect: { x: n.x, y: n.y, width: n.w, height: n.h },
      ports: [],
    })
    addedNodes.add(n.id)
  }

  // Add permeable container HEADERS as obstacles
  for (const n of nodes) {
    if (globalPermeable.has(n.id) && isContainer.has(n.id)) {
      const hdrId = n.id + '__hdr'
      router.addNode({
        id: hdrId,
        rect: { x: n.x, y: n.y, width: n.w, height: HEADER_HEIGHT },
        ports: [],
      })
      addedNodes.add(hdrId)
    }
  }

  // Add source/target nodes WITH ports for each edge
  // A node may be source/target for multiple edges → collect all ports
  const nodePortsMap = new Map<string, Port[]>()

  // Group ALL edges by target node (every edge needs ports on all 3 sides)
  const edgesByTarget = new Map<string, string[]>()
  for (const edge of edges) {
    if (!nodeMap.get(edge.srcId) || !nodeMap.get(edge.tgtId)) continue
    if (!edgesByTarget.has(edge.tgtId)) edgesByTarget.set(edge.tgtId, [])
    edgesByTarget.get(edge.tgtId)!.push(edge.id)
  }

  for (const edge of edges) {
    const src = nodeMap.get(edge.srcId)
    const tgt = nodeMap.get(edge.tgtId)
    if (!src || !tgt) continue

    // Source port
    const srcSide = edge.sourcePortY != null ? 'right' as const : bestSide(src, tgt)
    const srcOffset = edge.sourcePortY != null ? edge.sourcePortY / src.h : 0.5
    const srcPortId = `${edge.id}__src`
    if (!nodePortsMap.has(edge.srcId)) nodePortsMap.set(edge.srcId, [])
    nodePortsMap.get(edge.srcId)!.push({ id: srcPortId, nodeId: edge.srcId, side: srcSide, offset: srcOffset })

    // Target ports: top, left, right — spread evenly per side across ALL edges to this node
    const tgtSide = bestSide(tgt, src)
    const tgtPortId = `${edge.id}__tgt`
    const altPortIds: string[] = []
    const allEdgesToTgt = edgesByTarget.get(edge.tgtId)!
    const idx = allEdgesToTgt.indexOf(edge.id)
    const count = allEdgesToTgt.length

    const sides: Array<'top' | 'left' | 'right'> = ['top', 'left', 'right']
    const orderedSides = [tgtSide, ...sides.filter(s => s !== tgtSide)].filter(
      (s): s is 'top' | 'left' | 'right' => s === 'top' || s === 'left' || s === 'right'
    )

    if (!nodePortsMap.has(edge.tgtId)) nodePortsMap.set(edge.tgtId, [])
    for (let i = 0; i < orderedSides.length; i++) {
      const side = orderedSides[i]

      let offset: number
      if (side === 'top') {
        offset = count === 1 ? 0.5 : 0.2 + (0.6 * idx) / (count - 1)
      } else {
        // Spread within header zone on left/right
        const headerTop = HEADER_HEIGHT * 0.2 / tgt.h
        const headerBot = HEADER_HEIGHT * 0.8 / tgt.h
        offset = count === 1
          ? Math.min(0.5, (HEADER_HEIGHT / 2) / tgt.h)
          : headerTop + ((headerBot - headerTop) * idx) / (count - 1)
      }

      const portId = i === 0 ? tgtPortId : `${edge.id}__tgt_alt${i}`
      nodePortsMap.get(edge.tgtId)!.push({ id: portId, nodeId: edge.tgtId, side, offset })
      if (i > 0) altPortIds.push(portId)
    }

    // Add connection with alternative targets
    router.addConnection({
      id: edge.id,
      sourcePortId: srcPortId,
      targetPortId: tgtPortId,
      alternativeTargetPortIds: altPortIds.length > 0 ? altPortIds : undefined,
    })
  }

  // Add nodes with their collected ports
  for (const [nodeId, ports] of nodePortsMap) {
    const n = nodeMap.get(nodeId)!
    if (!addedNodes.has(nodeId)) {
      router.addNode({
        id: nodeId,
        rect: { x: n.x, y: n.y, width: n.w, height: n.h },
        ports,
      })
      addedNodes.add(nodeId)
    }
  }

  // Route all at once
  const routeResult = router.route()

  // Build results — only tsrouter paths, no fallback
  const result = new Map<string, EdgeRoute>()
  for (const edge of edges) {
    const routed = routeResult.paths.find(p => p.connectionId === edge.id)
    if (routed && routed.points.length >= 2) {
      const d = 'M' + routed.points.map(p => `${p.x},${p.y}`).join(' L')
      result.set(edge.id, { path: routed.points, d })
    }
  }

  // Log errors
  if (routeResult.errors?.length) {
    console.warn('[tsrouter]', routeResult.errors)
  }

  return result
}

function bestSide(from: NodeRect, to: NodeRect): 'top' | 'right' | 'bottom' | 'left' {
  const dx = (to.x + to.w / 2) - (from.x + from.w / 2)
  const dy = (to.y + to.h / 2) - (from.y + from.h / 2)
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left'
  return dy > 0 ? 'bottom' : 'top'
}
