/**
 * Reactive ELK layout over an interpreted domain model.
 *
 *   domain change ──(EContentAdapter)──▶ layout/render version bump
 *        layoutVersion ─▶ debounce ─▶ interpret() ─▶ elk.layout() ─▶ laidOut
 *
 * Layout-relevant changes (add/remove nodes/edges) trigger a re-layout;
 * content-only changes (SET on an attribute) only bump renderVersion so the
 * renderer re-reads live values without recomputing geometry.
 *
 * Pin-overlay (variant B): user-dragged nodes are kept at their manual
 * position across re-layouts, keyed by the stable domain id.
 */
import { ref, shallowRef, reactive, watch, onMounted, onBeforeUnmount, type Ref } from 'vue'
import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js'
import { EContentAdapter, NotificationType, type EObject, type Notification } from '@emfts/core'
import { interpret, type NodeRef, type EdgeMeta } from './interpret'

const elk = new ELK()

const STRUCTURAL = new Set<number>([
  NotificationType.ADD,
  NotificationType.REMOVE,
  NotificationType.ADD_MANY,
  NotificationType.REMOVE_MANY,
])

export interface ElkLayout {
  laidOut: Ref<ElkNode | null>
  nodeIndex: Ref<Map<string, NodeRef>>
  edgeMeta: Ref<Map<string, EdgeMeta>>
  renderVersion: Ref<number>
  layoutVersion: Ref<number>
  pins: Map<string, { x: number; y: number }>
  pin: (id: string, x: number, y: number) => void
  portNodeMap: Ref<Map<string, string>>
}

export function useElkLayout(model: EObject, root: EObject): ElkLayout {
  const layoutVersion = ref(0)
  const renderVersion = ref(0)
  const pins = reactive(new Map<string, { x: number; y: number }>())
  const laidOut = shallowRef<ElkNode | null>(null)
  const nodeIndex = shallowRef<Map<string, NodeRef>>(new Map())
  const edgeMeta = shallowRef<Map<string, EdgeMeta>>(new Map())
  const portNodeMap = shallowRef<Map<string, string>>(new Map())

  class SyncAdapter extends EContentAdapter {
    notifyChanged(notification: Notification): void {
      super.notifyChanged(notification) // keep adapter attached to new/removed children
      if (notification.isTouch()) return
      if (STRUCTURAL.has(notification.getEventType())) layoutVersion.value++
      else renderVersion.value++
    }
  }
  const adapter = new SyncAdapter()

  let timer: ReturnType<typeof setTimeout> | undefined

  async function run(): Promise<void> {
    const { graph, index, edgeMeta: meta, portNodeMap: ports } = interpret(model, root)
    nodeIndex.value = index
    edgeMeta.value = meta
    portNodeMap.value = ports

    // Drop pins whose node no longer exists (walk full tree).
    const ids = new Set<string>()
    function collectIds(children: typeof graph.children) {
      for (const c of children ?? []) {
        ids.add(c.id)
        if (c.children) collectIds(c.children)
      }
    }
    collectIds(graph.children)
    for (const id of [...pins.keys()]) if (!ids.has(id)) pins.delete(id)

    // ELK for node positions only. Edge routing is done by orthogonalRouter in the renderer.
    const result = await elk.layout(graph)
    laidOut.value = result
    pins.clear()
  }

  watch(
    layoutVersion,
    () => {
      clearTimeout(timer)
      timer = setTimeout(run, 80)
    },
    { immediate: true },
  )

  onMounted(() => {
    ;(root as unknown as { eAdapterAdd(a: EContentAdapter): void }).eAdapterAdd(adapter)
  })
  onBeforeUnmount(() => {
    clearTimeout(timer)
    const notifier = root as unknown as {
      eAdapterRemove?(a: EContentAdapter): boolean
      eAdapters(): EContentAdapter[]
    }
    if (notifier.eAdapterRemove) notifier.eAdapterRemove(adapter)
    else {
      const a = notifier.eAdapters()
      const i = a.indexOf(adapter)
      if (i >= 0) a.splice(i, 1)
    }
  })

  function pin(id: string, x: number, y: number): void {
    pins.set(id, { x, y })
    layoutVersion.value++ // trigger ELK re-layout with the new pinned position
  }

  return { laidOut, nodeIndex, edgeMeta, renderVersion, layoutVersion, pins, pin, portNodeMap }
}
