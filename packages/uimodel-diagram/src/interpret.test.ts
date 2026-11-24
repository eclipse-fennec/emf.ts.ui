/**
 * Projektion: aus DiagramModel und Domänenwurzel wird ein ELK-Graph.
 *
 * Schwerpunkt sind die Begriffe, die der Netzplan gebraucht hat: Symbolknoten
 * fester Größe, Rahmen aus Feature-Werten (NodeGrouping) und Kanten, die über
 * ein Zwischenobjekt zu ihren Knoten finden.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { EPackageRegistry, registerEcorePackage } from '@emfts/core'
import type { EObject } from '@emfts/core'
import { UimodelPackage, UimodelFactory } from '@emfts/uimodel-composer'
import { UimodelDiagramPackage, UimodelDiagramFactory } from './generated'
import { interpret, resolveNodeView } from './interpret'
import { HEADER_H } from './interpret'
import { addTo, createNetDomain, set, setPath, type NetDomain } from './testFixture'

let domain: NetDomain
let f: typeof UimodelDiagramFactory.eINSTANCE

beforeAll(() => {
  registerEcorePackage()
  const uimodel = UimodelPackage.eINSTANCE
  uimodel.setEFactoryInstance(UimodelFactory.eINSTANCE)
  EPackageRegistry.INSTANCE.set(uimodel.getNsURI()!, uimodel)
  const diagram = UimodelDiagramPackage.eINSTANCE
  diagram.setEFactoryInstance(UimodelDiagramFactory.eINSTANCE)
  EPackageRegistry.INSTANCE.set(diagram.getNsURI()!, diagram)
  f = UimodelDiagramFactory.eINSTANCE
  domain = createNetDomain()
})

/* ------------------------------------------------------------- Netzdaten */

let net: EObject

function makeDevice(name: string, kind: string, location = ''): EObject {
  const d = domain.factory.create(domain.classes.Device)
  set(d, 'name', name)
  set(d, 'kind', kind)
  if (location) set(d, 'location', location)
  addTo(net, 'devices', d)
  return d
}

/** Ein Port am Gerät. Die Rückreferenz wird gesetzt, wie ein Loader es täte:
 *  emf.ts pflegt die eOpposite einer Containment-Liste bei dynamischen
 *  EObjects nicht von selbst — das Containment allein genügt dem Interpreter
 *  aber auch, siehe den Test zum Rückfall über eContainer. */
function makePort(device: EObject, name: string, backReference = true): EObject {
  const p = domain.factory.create(domain.classes.Port)
  set(p, 'name', name)
  addTo(device, 'ports', p)
  if (backReference) set(p, 'device', device)
  return p
}

function makeSite(name: string, path: string, parent = '', kind = 'LOCATION'): EObject {
  const s = domain.factory.create(domain.classes.Site)
  set(s, 'name', name)
  set(s, 'path', path)
  set(s, 'kind', kind)
  if (parent) set(s, 'parent', parent)
  addTo(net, 'sites', s)
  return s
}

function makeRack(key: string, name: string, site: string): EObject {
  const r = domain.factory.create(domain.classes.Rack)
  set(r, 'key', key)
  set(r, 'name', name)
  set(r, 'site', site)
  addTo(net, 'racks', r)
  return r
}

function mountIn(device: EObject, rack: EObject): void {
  const m = domain.factory.create(domain.classes.Mount)
  set(m, 'rack', rack)
  set(device, 'mount', m)
}

function makeLink(a: EObject, b: EObject, trunk = false): EObject {
  const l = domain.factory.create(domain.classes.Link)
  set(l, 'a', a)
  set(l, 'b', b)
  set(l, 'trunk', trunk)
  addTo(net, 'links', l)
  return l
}

beforeEach(() => {
  net = domain.factory.create(domain.classes.Network)
})

/* --------------------------------------------------------- Diagrammodell */

/** Ein DiagramModel mit einem Mapping auf Network.devices. */
function deviceDiagram(): { model: EObject; mapping: EObject } {
  const model = f.createDiagramModel() as unknown as EObject
  const mapping = f.createNodeMapping() as unknown as EObject
  set(mapping, 'name', 'devices')
  setPath(mapping, 'from', [domain.f['Network.devices']])
  set(mapping, 'labelFeature', domain.f['Device.name'])
  addTo(model, 'nodes', mapping)
  return { model, mapping }
}

function symbolRenderer(shape: string, size: number): EObject {
  const renderer = f.createSingleNodeRenderer() as unknown as EObject
  const symbol = f.createNodeSymbol() as unknown as EObject
  set(symbol, 'shape', shape)
  set(symbol, 'width', size)
  set(symbol, 'labelPlacement', 'NONE')
  set(renderer, 'symbol', symbol)
  return renderer
}

/** Die Gruppierung nach Device.location über Network.sites. */
function siteGrouping(model: EObject): EObject {
  const g = f.createNodeGrouping() as unknown as EObject
  set(g, 'name', 'site')
  set(g, 'keyFeature', domain.f['Device.location'])
  setPath(g, 'from', [domain.f['Network.sites']])
  set(g, 'identityFeature', domain.f['Site.path'])
  set(g, 'labelFeature', domain.f['Site.name'])
  set(g, 'parentFeature', domain.f['Site.parent'])
  addTo(model, 'groupings', g)
  return g
}

/** Die Gruppierung nach dem Rack, in dem ein Gerät steckt. */
function rackGrouping(model: EObject, parent: EObject): EObject {
  const g = f.createNodeGrouping() as unknown as EObject
  set(g, 'name', 'rack')
  setPath(g, 'keyPath', [domain.f['Device.mount'], domain.f['Mount.rack']])
  set(g, 'keyFeature', domain.f['Rack.key'])
  setPath(g, 'from', [domain.f['Network.racks']])
  set(g, 'identityFeature', domain.f['Rack.key'])
  set(g, 'labelFeature', domain.f['Rack.name'])
  set(g, 'parentFeature', domain.f['Rack.site'])
  set(g, 'parentGrouping', parent)
  addTo(model, 'groupings', g)
  return g
}

/** Alle Knoten eines ELK-Baums, flach, mit ihrer Tiefe. */
function flatten(children: any[] | undefined, depth = 0): { id: string; depth: number; node: any }[] {
  return (children ?? []).flatMap((c) => [{ id: c.id, depth, node: c }, ...flatten(c.children, depth + 1)])
}

/* ------------------------------------------------------------------ Tests */

describe('Symbolknoten', () => {
  it('bekommt die Größe aus seinem Symbol statt der Kastenbreite', () => {
    makeDevice('sw-01', 'SWITCH')
    const { model, mapping } = deviceDiagram()
    set(mapping, 'renderer', symbolRenderer('ROUND_RECTANGLE', 34))

    const nodes = flatten(interpret(model, net).graph.children)
    expect(nodes).toHaveLength(1)
    expect(nodes[0].node.width).toBe(34)
    expect(nodes[0].node.height).toBe(34)
  })

  it('bleibt ohne Renderer der Kastenknoten mit Kopfhöhe', () => {
    makeDevice('sw-01', 'SWITCH')
    const { model } = deviceDiagram()

    const nodes = flatten(interpret(model, net).graph.children)
    expect(nodes[0].node.width).toBe(220)
    expect(nodes[0].node.height).toBeGreaterThanOrEqual(HEADER_H)
  })
})

describe('Beschriftung', () => {
  it('setzt eine mehrwertige Beschriftung aus allen Werten zusammen', () => {
    const d = makeDevice('sw-01', 'SWITCH')
    set(d, 'ip', '192.168.1.11')
    const { model, mapping } = deviceDiagram()
    set(mapping, 'sublabelFeature', domain.f['Device.ip'])
    set(mapping, 'renderer', symbolRenderer('ROUND_RECTANGLE', 24))

    const result = interpret(model, net)
    const ref = [...result.index.values()][0]
    expect(resolveNodeView(ref.obj, ref.mapping).sublabel).toBe('192.168.1.11')
  })
})

describe('Rahmen aus Feature-Werten', () => {
  it('legt je Standort einen Rahmen an und schachtelt ihn nach Site.parent', () => {
    makeSite('Hauptstelle', 'Hauptstelle')
    makeSite('Etage 1', 'Hauptstelle > Etage 1', 'Hauptstelle')
    makeDevice('sw-01', 'SWITCH', 'Hauptstelle > Etage 1')
    const { model, mapping } = deviceDiagram()
    set(mapping, 'renderer', symbolRenderer('ROUND_RECTANGLE', 24))
    addTo(mapping, 'groupings', siteGrouping(model))

    const result = interpret(model, net)
    const nodes = flatten(result.graph.children)
    const outer = nodes.find((n) => n.depth === 0)!
    const inner = nodes.find((n) => n.depth === 1)!
    const device = nodes.find((n) => n.depth === 2)!

    expect(result.frames.get(outer.id)?.label).toBe('Hauptstelle')
    expect(result.frames.get(inner.id)?.label).toBe('Etage 1')
    expect(result.frames.has(device.id)).toBe(false)
    expect(device.node.width).toBe(24)
  })

  it('legt nur Rahmen an, in denen ein Gerät liegt — samt der umgebenden', () => {
    makeSite('Hauptstelle', 'Hauptstelle')
    makeSite('Etage 1', 'Hauptstelle > Etage 1', 'Hauptstelle')
    makeSite('Etage 2', 'Hauptstelle > Etage 2', 'Hauptstelle')
    makeSite('Filiale', 'Filiale')
    makeDevice('sw-01', 'SWITCH', 'Hauptstelle > Etage 1')
    const { model, mapping } = deviceDiagram()
    addTo(mapping, 'groupings', siteGrouping(model))

    const result = interpret(model, net)
    // Etage 1 und Hauptstelle — Etage 2 und Filiale bleiben leer und fehlen.
    expect([...result.frames.values()].map((fr) => fr.label).sort()).toEqual(['Etage 1', 'Hauptstelle'])
  })

  it('lässt ein Gerät ohne Standort auf der obersten Ebene', () => {
    makeSite('Hauptstelle', 'Hauptstelle')
    makeDevice('sw-01', 'SWITCH', 'Hauptstelle')
    makeDevice('unbekannt', 'CLIENT')
    const { model, mapping } = deviceDiagram()
    addTo(mapping, 'groupings', siteGrouping(model))

    const result = interpret(model, net)
    const top = (result.graph.children ?? []).map((c) => c.id)
    // Ein Rahmen (Hauptstelle) und das Gerät ohne Standort.
    expect(top).toHaveLength(2)
    expect(top.filter((id) => result.frames.has(id))).toHaveLength(1)
  })

  it('nimmt die erste Gruppierung, die greift: erst das Rack, sonst der Standort', () => {
    makeSite('RZ', 'Hauptstelle > RZ', 'Hauptstelle', 'DATACENTER')
    makeSite('Hauptstelle', 'Hauptstelle')
    const rack = makeRack('rack:1', 'Rack A', 'Hauptstelle > RZ')
    const server = makeDevice('srv-01', 'SERVER', 'Hauptstelle > RZ')
    mountIn(server, rack)
    makeDevice('sw-01', 'SWITCH', 'Hauptstelle')

    const { model, mapping } = deviceDiagram()
    const sites = siteGrouping(model)
    // Reihenfolge entscheidet: Rack zuerst.
    addTo(mapping, 'groupings', rackGrouping(model, sites))
    addTo(mapping, 'groupings', sites)

    const result = interpret(model, net)
    const labels = [...result.frames.values()].map((fr) => fr.label).sort()
    expect(labels).toEqual(['Hauptstelle', 'RZ', 'Rack A'])

    // Der Server steckt im Rack, das Rack im RZ, das RZ in der Hauptstelle.
    const nodes = flatten(result.graph.children)
    const rackFrame = nodes.find((n) => result.frames.get(n.id)?.label === 'Rack A')!
    const serverNode = flatten(rackFrame.node.children)[0]
    expect(serverNode).toBeDefined()
    expect(result.frames.has(serverNode.id)).toBe(false)
    expect(rackFrame.depth).toBe(2)
  })

  it('beschriftet einen Rahmen mit weiteren Feature-Werten', () => {
    makeSite('RZ', 'RZ', '', 'DATACENTER')
    const rack = makeRack('rack:1', 'Rack A', 'RZ')
    set(rack, 'units', '42 HE')
    const server = makeDevice('srv-01', 'SERVER', 'RZ')
    mountIn(server, rack)

    const { model, mapping } = deviceDiagram()
    const sites = siteGrouping(model)
    const racks = rackGrouping(model, sites)
    addTo(racks, 'sublabelFeature', domain.f['Rack.units'] as unknown as EObject)
    addTo(mapping, 'groupings', racks)

    const result = interpret(model, net)
    expect([...result.frames.values()].map((fr) => fr.label)).toContain('Rack A · 42 HE')
  })

  it('bricht einen Zyklus in parentFeature ab, statt endlos zu laufen', () => {
    // Zwei Orte, die einander als Elternteil nennen.
    makeSite('A', 'A', 'B')
    makeSite('B', 'B', 'A')
    makeDevice('sw-01', 'SWITCH', 'A')

    const { model, mapping } = deviceDiagram()
    addTo(mapping, 'groupings', siteGrouping(model))

    const result = interpret(model, net)
    expect([...result.frames.values()].map((fr) => fr.label).sort()).toEqual(['A', 'B'])
  })
})

describe('Kanten über ein Zwischenobjekt', () => {
  it('findet vom Kabel über den Port zum Geräteknoten', () => {
    const a = makeDevice('sw-01', 'SWITCH')
    const b = makeDevice('srv-01', 'SERVER')
    makeLink(makePort(a, 'ge-0/0/1'), makePort(b, 'eth0'), true)

    const { model, mapping } = deviceDiagram()
    set(mapping, 'renderer', symbolRenderer('ROUND_RECTANGLE', 24))

    const edgeMapping = f.createEdgeMapping() as unknown as EObject
    setPath(edgeMapping, 'fromPath', [domain.f['Network.links']])
    setPath(edgeMapping, 'sourcePath', [domain.f['Link.a'], domain.f['Port.device']])
    setPath(edgeMapping, 'targetPath', [domain.f['Link.b'], domain.f['Port.device']])
    const renderer = f.createRuleBasedEdgeRenderer() as unknown as EObject
    const trunkRule = f.createEdgeRule() as unknown as EObject
    set(trunkRule, 'whenFeature', domain.f['Link.trunk'])
    const trunkSymbol = f.createEdgeSymbol() as unknown as EObject
    set(trunkSymbol, 'width', 3)
    set(trunkRule, 'symbol', trunkSymbol)
    addTo(renderer, 'rules', trunkRule)
    set(edgeMapping, 'renderer', renderer)
    addTo(model, 'edges', edgeMapping)

    const result = interpret(model, net)
    const edges = result.graph.edges ?? []
    expect(edges).toHaveLength(1)
    const nodeIds = flatten(result.graph.children).map((n) => n.id)
    expect(nodeIds).toContain(edges[0].sources[0])
    expect(nodeIds).toContain(edges[0].targets[0])
    // Das Symbol des Trunks steht in den Kantendaten.
    expect([...result.edgeMeta.values()][0].symbol.width).toBe(3)
  })

  it('findet den Knoten auch ohne Rückreferenz über das Containment', () => {
    const a = makeDevice('sw-01', 'SWITCH')
    const b = makeDevice('srv-01', 'SERVER')
    // Ports ohne gesetztes Port.device — nur im Gerät enthalten.
    makeLink(makePort(a, 'ge-0/0/1', false), makePort(b, 'eth0', false))

    const { model, mapping } = deviceDiagram()
    set(mapping, 'renderer', symbolRenderer('ROUND_RECTANGLE', 24))
    const edgeMapping = f.createEdgeMapping() as unknown as EObject
    setPath(edgeMapping, 'fromPath', [domain.f['Network.links']])
    // Der Pfad endet am Port; nodeContaining() steigt zum Geräteknoten auf.
    setPath(edgeMapping, 'sourcePath', [domain.f['Link.a']])
    setPath(edgeMapping, 'targetPath', [domain.f['Link.b']])
    addTo(model, 'edges', edgeMapping)

    const result = interpret(model, net)
    const edges = result.graph.edges ?? []
    expect(edges).toHaveLength(1)
    const nodeIds = flatten(result.graph.children).map((n) => n.id)
    expect(nodeIds).toContain(edges[0].sources[0])
    expect(nodeIds).toContain(edges[0].targets[0])
    expect(edges[0].sources[0]).not.toBe(edges[0].targets[0])
  })

  it('lässt eine Kante weg, deren Bedingung nicht zutrifft', () => {
    const a = makeDevice('sw-01', 'SWITCH')
    const b = makeDevice('srv-01', 'SERVER')
    makeLink(makePort(a, 'ge-0/0/1'), makePort(b, 'eth0'), false)

    const { model, mapping } = deviceDiagram()
    set(mapping, 'renderer', symbolRenderer('ROUND_RECTANGLE', 24))
    const edgeMapping = f.createEdgeMapping() as unknown as EObject
    setPath(edgeMapping, 'fromPath', [domain.f['Network.links']])
    setPath(edgeMapping, 'sourcePath', [domain.f['Link.a'], domain.f['Port.device']])
    setPath(edgeMapping, 'targetPath', [domain.f['Link.b'], domain.f['Port.device']])
    const condition = UimodelFactory.eINSTANCE.createExpression() as unknown as EObject
    set(condition, 'language', 'JS')
    set(condition, 'body', 'self.trunk === true')
    set(edgeMapping, 'condition', condition)
    addTo(model, 'edges', edgeMapping)

    expect(interpret(model, net).graph.edges ?? []).toHaveLength(0)
  })
})
