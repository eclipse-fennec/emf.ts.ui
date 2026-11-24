/**
 * Der Netzplan als Modell: lädt netzplan-diagram.xmi gegen netzplan.xmi und
 * prüft, dass daraus der Graph entsteht, den die handgeschriebene Vue-Ansicht
 * der Sparkasse zeichnet — Symbole je Geräteart, Rahmen je Standort und Rack,
 * Trunk-Kanten, Betriebslage als Overlay.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  BasicResourceSet,
  EPackageRegistry,
  URI,
  XMIResourceFactory,
  registerEcorePackage,
} from '@emfts/core'
import type { EObject, EList } from '@emfts/core'
import { UimodelPackage, UimodelFactory } from '@emfts/uimodel-composer'
import { UimodelDiagramPackage, UimodelDiagramFactory } from './generated'
import { interpret, nodeSymbolOf, resolveNodeView } from './interpret'
import { resolveFrameSymbol } from './symbology'

const APP = resolve(__dirname, '../../../apps/example')

let net: EObject
let view: EObject
let diagram: EObject

function get(o: EObject, name: string): any {
  const f = o.eClass().getEStructuralFeature(name)
  if (!f) throw new Error(`Kein Feature "${name}" an ${o.eClass().getName()}`)
  return o.eGet(f)
}

function list(o: EObject, name: string): EObject[] {
  return (get(o, name) as EList<EObject>).toArray()
}

function errorsOf(resource: { getErrors(): unknown }): unknown[] {
  const errors = resource.getErrors() as unknown
  return Array.isArray(errors) ? errors : (errors as { toArray(): unknown[] }).toArray()
}

beforeAll(async () => {
  registerEcorePackage()
  const uimodel = UimodelPackage.eINSTANCE
  uimodel.setEFactoryInstance(UimodelFactory.eINSTANCE)
  EPackageRegistry.INSTANCE.set(uimodel.getNsURI()!, uimodel)
  const diagramPkg = UimodelDiagramPackage.eINSTANCE
  diagramPkg.setEFactoryInstance(UimodelDiagramFactory.eINSTANCE)
  EPackageRegistry.INSTANCE.set(diagramPkg.getNsURI()!, diagramPkg)
  const { NetzplanPackage, NetzplanFactory } = await import(`${APP}/src/generated/netzplan/index.ts`)
  const netzplanPkg = NetzplanPackage.eINSTANCE
  netzplanPkg.setEFactoryInstance(NetzplanFactory.eINSTANCE)
  EPackageRegistry.INSTANCE.set(netzplanPkg.getNsURI()!, netzplanPkg)

  const set = new BasicResourceSet()
  set.getResourceFactoryRegistry().getExtensionToFactoryMap().set('xmi', new XMIResourceFactory())
  const load = (file: string): EObject => {
    const resource = set.createResource(URI.createURI(file))
    ;(resource as unknown as { loadFromString(s: string): void }).loadFromString(
      readFileSync(`${APP}/public/${file}`, 'utf8'),
    )
    expect(errorsOf(resource), `Ladefehler in ${file}`).toEqual([])
    return resource.getContents().get(0)
  }

  net = load('netzplan.xmi')
  const uiModel = load('netzplan-diagram.xmi')
  view = list(uiModel, 'components')[0]
  diagram = get(view, 'diagram')
})

describe('das geladene Modell', () => {
  it('hängt als DiagramView im UIModel und erbt von Component', () => {
    expect(view.eClass().getName()).toBe('DiagramView')
    const superTypes = (view.eClass().getEAllSuperTypes() as EList<any>).toArray().map((c) => c.getName())
    expect(superTypes).toContain('Component')
    expect(get(view, 'title')).toBe('Netzwerk-Topologie')
  })

  it('löst alle Feature-Referenzen des Mappings auf', () => {
    const mapping = list(diagram, 'nodes')[0]
    const labelFeature = get(mapping, 'labelFeature') as EObject
    expect(labelFeature.eClass().getName()).toMatch(/EAttribute|EStructuralFeature/)
    const from = (get(mapping, 'from') as EList<EObject>).toArray()
    expect(from).toHaveLength(1)
    expect((from[0] as any).getName?.() ?? get(from[0], 'name')).toBe('devices')
  })

  it('verweist das Geräte-Mapping auf beide Gruppierungen, Rack zuerst', () => {
    const mapping = list(diagram, 'nodes')[0]
    const groupings = (get(mapping, 'groupings') as EList<EObject>).toArray()
    expect(groupings.map((g) => String(get(g, 'name')))).toEqual(['rack', 'site'])
    // Die Rack-Gruppierung hängt in der Standort-Gruppierung.
    expect(get(get(groupings[0], 'parentGrouping') as EObject, 'name')).toBe('site')
    // Ihr Schlüssel liegt zwei Schritte vom Gerät entfernt.
    expect((get(groupings[0], 'keyPath') as EList<EObject>).toArray()).toHaveLength(2)
  })
})

describe('der projizierte Graph', () => {
  it('macht aus jedem Gerät einen Symbolknoten', () => {
    const result = interpret(diagram, net)
    expect(result.index.size).toBe(14)
    for (const ref of result.index.values()) {
      const symbol = nodeSymbolOf(ref.obj, ref.mapping)
      expect(symbol.shape).not.toBe('COMPARTMENTS')
      expect(symbol.width).toBeGreaterThan(0)
    }
  })

  it('gibt jeder Geräteart ihre Form', () => {
    const result = interpret(diagram, net)
    const shapes = new Map<string, string>()
    for (const ref of result.index.values()) {
      shapes.set(String(get(ref.obj, 'name')), nodeSymbolOf(ref.obj, ref.mapping).shape)
    }
    expect(shapes.get('rtr-01')).toBe('DIAMOND')
    expect(shapes.get('fw-01')).toBe('OCTAGON')
    expect(shapes.get('core-01')).toBe('ROUND_RECTANGLE')
    expect(shapes.get('atm-01')).toBe('CUT_RECTANGLE')
    expect(shapes.get('sensor-01')).toBe('ELLIPSE')
    expect(shapes.get('prn-01')).toBe('ELLIPSE')
  })

  it('färbt die Betriebslage, ohne die Form zu verlieren', () => {
    const result = interpret(diagram, net)
    const byName = new Map(
      [...result.index.values()].map((ref) => [String(get(ref.obj, 'name')), ref] as const),
    )
    // atm-01 ist nicht erreichbar: rot und kräftiger, aber weiter ein Achteck-Kasten.
    const atm = nodeSymbolOf(byName.get('atm-01')!.obj, byName.get('atm-01')!.mapping)
    expect(atm.shape).toBe('CUT_RECTANGLE')
    expect(atm.strokeColor).toBe('#dc2626')
    expect(atm.strokeWidth).toBe(4)
    // srv-02 hat ein Problem, srv-01 nicht — gleiche Form, andere Farbe.
    const srv2 = nodeSymbolOf(byName.get('srv-02')!.obj, byName.get('srv-02')!.mapping)
    const srv1 = nodeSymbolOf(byName.get('srv-01')!.obj, byName.get('srv-01')!.mapping)
    expect(srv2.shape).toBe(srv1.shape)
    expect(srv2.strokeColor).toBe('#d97706')
    expect(srv1.strokeColor).toBe('#0f766e')
    // tel-01 steht an einem abgeleiteten Standort: gestrichelter Rahmen.
    const tel = nodeSymbolOf(byName.get('tel-01')!.obj, byName.get('tel-01')!.mapping)
    expect(tel.strokeStyle).toBe('DASH')
  })

  it('setzt die IP als zweite Beschriftungszeile', () => {
    const result = interpret(diagram, net)
    const ref = [...result.index.values()].find((r) => get(r.obj, 'name') === 'core-01')!
    expect(resolveNodeView(ref.obj, ref.mapping).sublabel).toBe('192.168.1.3')
  })

  it('baut die Rahmen: Rack im Serverraum im Rechenzentrum am Standort', () => {
    const result = interpret(diagram, net)
    const labels = [...result.frames.values()].map((f) => f.label).sort((a, b) => a.localeCompare(b, 'de'))
    expect(labels).toEqual([
      'Etage 1',
      'Filiale Nord',
      'Hauptstelle',
      'Rack A1 · 42 HE',
      'Rechenzentrum',
      'RZ Hauptstelle',
    ])

    // Die Schachtelung im ELK-Baum: Hauptstelle › Rechenzentrum › RZ › Rack A1
    const depth = new Map<string, number>()
    const walk = (children: any[] | undefined, d = 0) => {
      for (const c of children ?? []) {
        const frame = result.frames.get(c.id)
        if (frame) depth.set(frame.label, d)
        walk(c.children, d + 1)
      }
    }
    walk(result.graph.children)
    expect(depth.get('Hauptstelle')).toBe(0)
    expect(depth.get('Rechenzentrum')).toBe(1)
    expect(depth.get('RZ Hauptstelle')).toBe(2)
    expect(depth.get('Rack A1 · 42 HE')).toBe(3)
    expect(depth.get('Etage 1')).toBe(1)
    expect(depth.get('Filiale Nord')).toBe(0)
  })

  it('zeichnet das Rechenzentrum anders als einen gewöhnlichen Standort', () => {
    const result = interpret(diagram, net)
    const frameByLabel = new Map([...result.frames.values()].map((f) => [f.label, f] as const))
    const dc = frameByLabel.get('Rechenzentrum')!
    const site = frameByLabel.get('Etage 1')!
    const dcSymbol = resolveFrameSymbol(dc.obj, get(dc.grouping, 'renderer'))
    const siteSymbol = resolveFrameSymbol(site.obj, get(site.grouping, 'renderer'))
    expect(dcSymbol.strokeStyle).toBe('DASH')
    expect(dcSymbol.strokeColor).toBe('#2563eb')
    expect(siteSymbol.strokeColor).toBe('#94a3b8')
  })

  it('legt jedes Gerät in seinen Rahmen — Eingebaute ins Rack', () => {
    const result = interpret(diagram, net)
    const parentFrame = new Map<string, string>()
    const walk = (children: any[] | undefined, frameLabel = '') => {
      for (const c of children ?? []) {
        const frame = result.frames.get(c.id)
        if (!frame && result.index.has(c.id)) {
          parentFrame.set(String(get(result.index.get(c.id)!.obj, 'name')), frameLabel)
        }
        walk(c.children, frame ? frame.label : frameLabel)
      }
    }
    walk(result.graph.children)
    expect(parentFrame.get('core-01')).toBe('Rack A1 · 42 HE')
    expect(parentFrame.get('srv-01')).toBe('Rack A1 · 42 HE')
    expect(parentFrame.get('sw-e1-01')).toBe('Etage 1')
    expect(parentFrame.get('pc-001')).toBe('Etage 1')
    expect(parentFrame.get('atm-01')).toBe('Filiale Nord')
  })

  it('verbindet die Geräte über ihre Kabel und hebt Trunks hervor', () => {
    const result = interpret(diagram, net)
    const edges = result.graph.edges ?? []
    expect(edges).toHaveLength(13)

    const nodeIds = new Set<string>()
    const walk = (children: any[] | undefined) => {
      for (const c of children ?? []) {
        if (result.index.has(c.id)) nodeIds.add(c.id)
        walk(c.children)
      }
    }
    walk(result.graph.children)
    for (const edge of edges) {
      expect(nodeIds.has(edge.sources[0]), `Quelle von ${edge.id} ist kein Geräteknoten`).toBe(true)
      expect(nodeIds.has(edge.targets[0]), `Ziel von ${edge.id} ist kein Geräteknoten`).toBe(true)
      expect(edge.sources[0]).not.toBe(edge.targets[0])
    }

    // Vier Trunks (fw→core, core→sw-e1, core→sw-fil) sind dicker und blau.
    const widths = [...result.edgeMeta.values()].map((m) => m.symbol.width)
    expect(widths.filter((w) => w === 3)).toHaveLength(3)
    expect(widths.filter((w) => w === 1.2)).toHaveLength(10)
    const trunk = [...result.edgeMeta.values()].find((m) => m.symbol.width === 3)!
    expect(trunk.symbol.color).toBe('#1d4ed8')
  })

  it('schreibt beim Klick den Gerätenamen über das Binding zurück', () => {
    const binding = list(view, 'bindings')[0]
    expect(get(binding, 'targetFeature')).toBeTruthy()
    expect((get(binding, 'sourceFeature') as any).getName?.()).toBe('name')
  })
})
