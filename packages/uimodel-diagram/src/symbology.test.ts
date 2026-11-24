/**
 * Symbologie: aus einem Renderer und einem Domänenobjekt wird ein Symbol.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { EPackageRegistry, registerEcorePackage } from '@emfts/core'
import type { EObject } from '@emfts/core'
import { UimodelPackage, UimodelFactory } from '@emfts/uimodel-composer'
import { UimodelDiagramPackage, UimodelDiagramFactory } from './generated'
import {
  COMPARTMENT_SYMBOL,
  DEFAULT_SYMBOL,
  FRAME_SYMBOL,
  dashArray,
  measureSymbolNode,
  resolveEdgeSymbol,
  resolveFrameSymbol,
  resolveNodeSymbol,
  shapePath,
} from './symbology'
import { addTo, createNetDomain, set, type NetDomain } from './testFixture'

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

/** Ein Gerät mit Art, Name und Zustand. */
function device(kind: string, name = 'sw-01', health = 'UNKNOWN'): EObject {
  const d = domain.factory.create(domain.classes.Device)
  set(d, 'name', name)
  set(d, 'kind', kind)
  set(d, 'health', health)
  return d
}

function symbol(props: Record<string, unknown>): EObject {
  const s = f.createNodeSymbol() as unknown as EObject
  for (const [key, value] of Object.entries(props)) set(s, key, value)
  return s
}

describe('ohne Renderer', () => {
  it('bleibt es beim Kastenknoten, damit Klassendiagramme unverändert zeichnen', () => {
    expect(resolveNodeSymbol(device('ROUTER'), undefined)).toBe(COMPARTMENT_SYMBOL)
    expect(resolveNodeSymbol(device('ROUTER'), null).shape).toBe('COMPARTMENTS')
  })

  it('bekommt ein Rahmen die Rahmen-Grundwerte, nicht die eines Symbolknotens', () => {
    expect(resolveFrameSymbol(null, undefined)).toBe(FRAME_SYMBOL)
    expect(FRAME_SYMBOL.labelPlacement).toBe('ABOVE')
  })
})

describe('SingleNodeRenderer', () => {
  it('überträgt die gesetzten Eigenschaften auf die Grundwerte', () => {
    const renderer = f.createSingleNodeRenderer() as unknown as EObject
    set(renderer, 'symbol', symbol({ shape: 'DIAMOND', width: 40, fillColor: '#fee' }))
    const view = resolveNodeSymbol(device('ROUTER'), renderer)
    expect(view.shape).toBe('DIAMOND')
    expect(view.width).toBe(40)
    expect(view.fillColor).toBe('#fee')
    // Nicht gesetzte Eigenschaften bleiben bei den Grundwerten.
    expect(view.strokeColor).toBe(DEFAULT_SYMBOL.strokeColor)
    expect(view.fontSize).toBe(DEFAULT_SYMBOL.fontSize)
  })

  it('liest width ohne height als quadratisch', () => {
    const renderer = f.createSingleNodeRenderer() as unknown as EObject
    set(renderer, 'symbol', symbol({ width: 34 }))
    const view = resolveNodeSymbol(device('SWITCH'), renderer)
    expect(view.width).toBe(34)
    expect(view.height).toBe(34)
  })
})

describe('CategorizedNodeRenderer', () => {
  function kindRenderer(): EObject {
    const renderer = f.createCategorizedNodeRenderer() as unknown as EObject
    set(renderer, 'classFeature', domain.f['Device.kind'])
    for (const [value, shape] of [
      ['ROUTER', 'DIAMOND'],
      ['FIREWALL', 'OCTAGON'],
      ['SWITCH', 'ROUND_RECTANGLE'],
    ] as const) {
      const category = f.createNodeCategory() as unknown as EObject
      set(category, 'value', value)
      set(category, 'symbol', symbol({ shape }))
      addTo(renderer, 'categories', category)
    }
    set(renderer, 'fallback', symbol({ shape: 'ELLIPSE', width: 16 }))
    return renderer
  }

  it('trifft die Kategorie über den Literalnamen des EEnum-Werts', () => {
    const renderer = kindRenderer()
    expect(resolveNodeSymbol(device('ROUTER'), renderer).shape).toBe('DIAMOND')
    expect(resolveNodeSymbol(device('FIREWALL'), renderer).shape).toBe('OCTAGON')
    expect(resolveNodeSymbol(device('SWITCH'), renderer).shape).toBe('ROUND_RECTANGLE')
  })

  it('nimmt für einen Wert ohne Kategorie den Fallback', () => {
    const view = resolveNodeSymbol(device('CLIENT'), kindRenderer())
    expect(view.shape).toBe('ELLIPSE')
    expect(view.width).toBe(16)
  })
})

describe('RuleBasedNodeRenderer', () => {
  function rule(props: {
    when?: string
    body?: string
    shape?: string
    strokeColor?: string
  }): EObject {
    const r = f.createNodeRule() as unknown as EObject
    if (props.when) set(r, 'whenFeature', domain.f[props.when])
    if (props.body) {
      const expression = UimodelFactory.eINSTANCE.createExpression() as unknown as EObject
      set(expression, 'language', 'JS')
      set(expression, 'body', props.body)
      set(r, 'filter', expression)
    }
    const sym: Record<string, unknown> = {}
    if (props.shape) sym.shape = props.shape
    if (props.strokeColor) sym.strokeColor = props.strokeColor
    set(r, 'symbol', symbol(sym))
    return r
  }

  it('nimmt die erste zutreffende Grundregel', () => {
    const renderer = f.createRuleBasedNodeRenderer() as unknown as EObject
    addTo(renderer, 'rules', rule({ body: "self.kind === 'ROUTER'", shape: 'DIAMOND' }))
    addTo(renderer, 'rules', rule({ body: 'true', shape: 'TRIANGLE' }))
    set(renderer, 'fallback', symbol({ shape: 'ELLIPSE' }))
    expect(resolveNodeSymbol(device('ROUTER'), renderer).shape).toBe('DIAMOND')
    // Die zweite Regel greift erst, wenn die erste nicht zutrifft.
    expect(resolveNodeSymbol(device('CLIENT'), renderer).shape).toBe('TRIANGLE')
  })

  it('legt Overlays über das Grundsymbol, ohne dessen Form zu verlieren', () => {
    const renderer = f.createRuleBasedNodeRenderer() as unknown as EObject
    addTo(renderer, 'rules', rule({ body: "self.kind === 'ROUTER'", shape: 'DIAMOND' }))
    addTo(renderer, 'overlays', rule({ body: "self.health === 'DOWN'", strokeColor: '#dc2626' }))
    const down = resolveNodeSymbol(device('ROUTER', 'r1', 'DOWN'), renderer)
    expect(down.shape).toBe('DIAMOND')
    expect(down.strokeColor).toBe('#dc2626')
    const ok = resolveNodeSymbol(device('ROUTER', 'r1', 'OK'), renderer)
    expect(ok.shape).toBe('DIAMOND')
    expect(ok.strokeColor).toBe(DEFAULT_SYMBOL.strokeColor)
  })

  it('greift ohne Treffer auf den Fallback zurück', () => {
    const renderer = f.createRuleBasedNodeRenderer() as unknown as EObject
    addTo(renderer, 'rules', rule({ body: "self.kind === 'ROUTER'", shape: 'DIAMOND' }))
    set(renderer, 'fallback', symbol({ shape: 'HEXAGON' }))
    expect(resolveNodeSymbol(device('CLIENT'), renderer).shape).toBe('HEXAGON')
  })
})

describe('Overlays am kategorisierten Renderer', () => {
  it('lässt die Form der Kategorie stehen und färbt nur den Zustand', () => {
    const renderer = f.createCategorizedNodeRenderer() as unknown as EObject
    set(renderer, 'classFeature', domain.f['Device.kind'])
    const category = f.createNodeCategory() as unknown as EObject
    set(category, 'value', 'SERVER')
    set(category, 'symbol', symbol({ shape: 'ROUND_RECTANGLE', width: 26 }))
    addTo(renderer, 'categories', category)

    const down = f.createNodeRule() as unknown as EObject
    const expression = UimodelFactory.eINSTANCE.createExpression() as unknown as EObject
    set(expression, 'language', 'JS')
    set(expression, 'body', "self.health === 'DOWN'")
    set(down, 'filter', expression)
    set(down, 'symbol', symbol({ strokeColor: '#dc2626', strokeWidth: 4 }))
    addTo(renderer, 'overlays', down)

    const broken = resolveNodeSymbol(device('SERVER', 'srv-02', 'DOWN'), renderer)
    expect(broken.shape).toBe('ROUND_RECTANGLE')
    expect(broken.width).toBe(26)
    expect(broken.strokeColor).toBe('#dc2626')
    expect(broken.strokeWidth).toBe(4)

    const healthy = resolveNodeSymbol(device('SERVER', 'srv-01', 'OK'), renderer)
    expect(healthy.strokeColor).toBe(DEFAULT_SYMBOL.strokeColor)
  })
})

describe('Kantensymbole', () => {
  it('unterscheidet Trunk und Access über ein boolesches Feature', () => {
    const renderer = f.createRuleBasedEdgeRenderer() as unknown as EObject
    const trunkRule = f.createEdgeRule() as unknown as EObject
    set(trunkRule, 'whenFeature', domain.f['Link.trunk'])
    const trunkSymbol = f.createEdgeSymbol() as unknown as EObject
    set(trunkSymbol, 'width', 3)
    set(trunkSymbol, 'color', '#2563eb')
    set(trunkRule, 'symbol', trunkSymbol)
    addTo(renderer, 'rules', trunkRule)

    const trunk = domain.factory.create(domain.classes.Link)
    set(trunk, 'trunk', true)
    const access = domain.factory.create(domain.classes.Link)
    set(access, 'trunk', false)

    expect(resolveEdgeSymbol(trunk, renderer).width).toBe(3)
    expect(resolveEdgeSymbol(trunk, renderer).color).toBe('#2563eb')
    expect(resolveEdgeSymbol(access, renderer).width).toBe(1.2)
  })
})

describe('Geometrie', () => {
  it('misst einen Symbolknoten mit Beschriftung darunter', () => {
    const box = measureSymbolNode({ ...DEFAULT_SYMBOL, width: 22, height: 22 }, ['sw-01', ''])
    // Die Beschriftung ist breiter als das Symbol und bestimmt die Knotenbreite.
    expect(box.w).toBeGreaterThan(22)
    expect(box.h).toBeGreaterThan(22)
    expect(box.symbolY).toBe(0)
    expect(box.anchor).toBe('middle')
  })

  it('stellt die Beschriftung bei ABOVE über das Symbol', () => {
    const box = measureSymbolNode({ ...DEFAULT_SYMBOL, labelPlacement: 'ABOVE' }, ['x'])
    expect(box.symbolY).toBeGreaterThan(0)
    expect(box.labelY).toBeLessThan(box.symbolY)
  })

  it('misst ohne Beschriftung genau das Symbol', () => {
    const box = measureSymbolNode({ ...DEFAULT_SYMBOL, width: 18, height: 18, labelPlacement: 'NONE' }, ['x'])
    expect(box).toMatchObject({ w: 18, h: 18, symbolX: 0, symbolY: 0 })
  })

  it('zeichnet jede Form als geschlossenen Pfad im Kasten', () => {
    for (const shape of ['RECTANGLE', 'DIAMOND', 'OCTAGON', 'HEXAGON', 'TRIANGLE', 'CUT_RECTANGLE'] as const) {
      const d = shapePath(shape, 20, 20)
      expect(d.startsWith('M')).toBe(true)
      expect(d.endsWith('Z')).toBe(true)
      // Kein Punkt liegt außerhalb des Kastens.
      for (const n of d.match(/-?\d+(\.\d+)?/g) ?? []) {
        expect(Number(n)).toBeGreaterThanOrEqual(0)
        expect(Number(n)).toBeLessThanOrEqual(20)
      }
    }
  })

  it('liefert ein Strichmuster nur für gestrichelte Arten', () => {
    expect(dashArray('SOLID', 1)).toBeUndefined()
    expect(dashArray('DOUBLE', 1)).toBeUndefined()
    expect(dashArray('DASH', 2)).toBe('6 4')
    expect(dashArray('DOT', 1)).toBeDefined()
  })
})
