/**
 * Rahmen aus Feature-Werten (NodeGrouping).
 *
 * Verschachtelte Knoten entstehen im Diagrammodell sonst nur aus dem Containment
 * (NodeMapping.children). Standorte sind aber keine Container ihrer Geräte: Ein
 * Gerät trägt den Pfad seines Standorts als Zeichenkette, und die Orte bilden
 * über ihren Elternpfad einen eigenen Baum. NodeGrouping macht daraus Rahmen:
 *
 *   keyPath/keyFeature   am Knotenobjekt  → der Schlüssel (Device.location)
 *   from/identityFeature an der Wurzel    → die Gruppenobjekte (Site.path)
 *   parentFeature        am Gruppenobjekt → der Schlüssel des Rahmens darum
 *   parentGrouping                        → in welcher Gruppierung der gilt
 *
 * Die Rahmen entstehen erst, wenn ein Knoten in sie fällt — samt ihrer
 * umgebenden. Leere Rahmen zeichnet niemand.
 */
import type { EObject, EStructuralFeature, EReference } from '@emfts/core'
import type { ElkNode } from 'elkjs/lib/elk.bundled.js'
import { featureValueAsString } from './symbology'

type ElkChild = NonNullable<ElkNode['children']>[number]

/** Ein Rahmen, wie ihn der Renderer braucht. */
export interface FrameRef {
  /** Das Gruppenobjekt (Site, Rack); null, wenn der Schlüssel keines trifft */
  obj: EObject | null
  /** Die NodeGrouping, aus der der Rahmen stammt */
  grouping: EObject
  key: string
  label: string
}

interface Resolved {
  obj: EObject
  name: string
  keyPath: EReference[]
  keyFeature?: EStructuralFeature
  identityFeature?: EStructuralFeature
  labelFeature?: EStructuralFeature
  sublabelFeatures: EStructuralFeature[]
  parentFeature?: EStructuralFeature
  parentGrouping?: EObject
  padding: number
  /** Schlüssel → Gruppenobjekt */
  members: Map<string, EObject>
}

export interface GrouperDeps {
  get(o: EObject, name: string): unknown
  items(o: EObject, name: string): EObject[]
  featureOf(o: EObject, name: string): EStructuralFeature | undefined
  pathOf(o: EObject, name: string): EReference[]
  featuresOf(o: EObject, name: string): EStructuralFeature[]
  follow(start: EObject, path: EReference[]): EObject[]
}

/**
 * Baut die Rahmen eines Diagramms und sortiert Knoten hinein. Eine Instanz je
 * Lauf von interpret(), damit die Mitglieder-Indizes nur einmal entstehen.
 */
export class Grouper {
  readonly frames = new Map<string, FrameRef>()
  private readonly elk = new Map<string, ElkChild>()
  private readonly parentOf = new Map<string, string>()
  private readonly resolved = new Map<EObject, Resolved>()
  private readonly building = new Set<string>()

  constructor(
    private readonly root: EObject,
    private readonly deps: GrouperDeps,
  ) {}

  /** Hat das Diagramm überhaupt Rahmen erzeugt? */
  get empty(): boolean {
    return this.elk.size === 0
  }

  /**
   * Die Rahmen-Id für ein Knotenobjekt: die erste Gruppierung der Liste, die
   * einen Schlüssel liefert, gewinnt (erst das Rack, sonst der Standort).
   * null, wenn keine greift — der Knoten bleibt dann auf oberster Ebene.
   */
  frameFor(obj: EObject, groupings: EObject[]): string | null {
    for (const grouping of groupings) {
      const key = this.keyOf(obj, this.resolve(grouping))
      if (key) return this.ensureFrame(grouping, key)
    }
    return null
  }

  /** Hängt einen gelayouteten Knoten in seinen Rahmen. */
  place(frameId: string, node: ElkChild): void {
    const frame = this.elk.get(frameId)
    if (!frame) return
    ;(frame.children ??= []).push(node)
  }

  /** Die Rahmen ohne eigenen Elternrahmen — die oberste Ebene des Graphen. */
  roots(): ElkChild[] {
    return [...this.elk.entries()]
      .filter(([id]) => !this.parentOf.has(id))
      .map(([, node]) => node)
  }

  /* ------------------------------------------------------------ intern */

  private resolve(grouping: EObject): Resolved {
    const cached = this.resolved.get(grouping)
    if (cached) return cached
    const { get, featureOf, pathOf, featuresOf, follow } = this.deps
    const identityFeature = featureOf(grouping, 'identityFeature')
    const members = new Map<string, EObject>()
    for (const member of follow(this.root, pathOf(grouping, 'from'))) {
      const id = featureValueAsString(member, identityFeature)
      // Der erste Treffer gewinnt, wie bei gleichnamigen Features in EMF.
      if (id && !members.has(id)) members.set(id, member)
    }
    const value: Resolved = {
      obj: grouping,
      name: String(get(grouping, 'name') ?? ''),
      keyPath: pathOf(grouping, 'keyPath'),
      keyFeature: featureOf(grouping, 'keyFeature'),
      identityFeature,
      labelFeature: featureOf(grouping, 'labelFeature'),
      sublabelFeatures: featuresOf(grouping, 'sublabelFeature'),
      parentFeature: featureOf(grouping, 'parentFeature'),
      parentGrouping: (get(grouping, 'parentGrouping') as EObject | undefined) ?? undefined,
      padding: Number(get(grouping, 'padding') ?? 24) || 24,
      members,
    }
    this.resolved.set(grouping, value)
    return value
  }

  /** Der Gruppenschlüssel eines Knotenobjekts, '' wenn es keinen trägt. */
  private keyOf(obj: EObject, g: Resolved): string {
    const carriers = g.keyPath.length ? this.deps.follow(obj, g.keyPath) : [obj]
    for (const carrier of carriers) {
      const key = featureValueAsString(carrier, g.keyFeature)
      if (key) return key
    }
    return ''
  }

  private frameId(g: Resolved, key: string): string {
    return `grp:${g.name || 'group'}:${key}`
  }

  /** Legt den Rahmen an, falls nötig, samt der Rahmen darum. Gibt die Id zurück. */
  private ensureFrame(grouping: EObject, key: string): string {
    const g = this.resolve(grouping)
    const id = this.frameId(g, key)
    if (this.elk.has(id)) return id
    // Ein Zyklus in parentFeature (A → B → A) würde hier endlos laufen.
    if (this.building.has(id)) return id
    this.building.add(id)

    const obj = g.members.get(key) ?? null
    const label = obj
      ? [
          featureValueAsString(obj, g.labelFeature) || key,
          ...g.sublabelFeatures.map((f) => featureValueAsString(obj, f)),
        ]
          .filter(Boolean)
          .join(' · ')
      : key

    const pad = g.padding
    const node: ElkChild = {
      id,
      labels: [{ text: label }],
      children: [],
      layoutOptions: {
        'elk.padding': `[top=${pad + 14},left=${pad},bottom=${pad},right=${pad}]`,
        'elk.spacing.nodeNode': '24',
      },
    }
    this.elk.set(id, node)
    this.frames.set(id, { obj, grouping, key, label })

    // Den umgebenden Rahmen anlegen und sich dort einhängen.
    const parentKey = obj && g.parentFeature ? featureValueAsString(obj, g.parentFeature) : ''
    if (parentKey) {
      const parentId = this.ensureFrame(g.parentGrouping ?? grouping, parentKey)
      if (parentId !== id) {
        this.parentOf.set(id, parentId)
        this.place(parentId, node)
      }
    }

    this.building.delete(id)
    return id
  }
}
