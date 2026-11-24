/**
 * Regression: Das Ecore-Klassendiagramm der example-App zeichnet nach dem Umzug
 * des Metamodells (http://diagrammodel/1.0 → http://uimodel/diagram/1.0)
 * unverändert — Kastenknoten mit Compartments, Gruppen-Behälter, Vererbungs-
 * kanten. Es nutzt keinen Renderer, also darf nichts von der neuen Symbologie
 * durchschlagen.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  BasicResourceSet,
  EPackageRegistry,
  URI,
  XMIResourceFactory,
  getEcorePackage,
  registerEcorePackage,
} from '@emfts/core'
import type { EObject, EList } from '@emfts/core'
import { UimodelPackage, UimodelFactory, registerOclEvaluator } from '@emfts/uimodel-composer'
import { UimodelDiagramPackage, UimodelDiagramFactory } from './generated'
import { HEADER_H, interpret, nodeSymbolOf, resolveNodeView, rowCount } from './interpret'

const APP = resolve(__dirname, '../../../apps/example')

/**
 * Ein Stub für die vier OCL-Ausdrücke dieses Beispiels. Ohne registrierten
 * Evaluator liefert evaluateBoolean() für OCL pauschal true — dann träfen alle
 * drei Klassen-Mappings auf jede EClass zu und der Test prüfte nichts. Ein
 * vollständiger OCL-Interpreter (@emfts/ocl.langium, wie die App ihn einhängt)
 * braucht asynchrones Vorparsen; hier genügen die bekannten Ausdrücke. Ein
 * unbekannter Ausdruck wirft, damit der Test nicht still falsch wird.
 */
class StubOclValidator {
  evaluateExpression(body: string, context: any): boolean {
    switch (body) {
      case 'self.abstract = false':
        return context.abstract !== true
      case 'self.abstract = true and self.interface <> true':
        return context.abstract === true && context.interface !== true
      case 'self.interface = true':
        return context.interface === true
      case '!!self.defaultValueLiteral':
        return !!context.defaultValueLiteral
      default:
        throw new Error(`Unbekannter Ausdruck im Beispiel: ${body}`)
    }
  }
}

let diagram: EObject
let ecoreDomain: EObject

beforeAll(() => {
  registerEcorePackage()
  registerOclEvaluator(StubOclValidator)
  const uimodel = UimodelPackage.eINSTANCE
  uimodel.setEFactoryInstance(UimodelFactory.eINSTANCE)
  EPackageRegistry.INSTANCE.set(uimodel.getNsURI()!, uimodel)
  const diagramPkg = UimodelDiagramPackage.eINSTANCE
  diagramPkg.setEFactoryInstance(UimodelDiagramFactory.eINSTANCE)
  EPackageRegistry.INSTANCE.set(diagramPkg.getNsURI()!, diagramPkg)
  const ecore = getEcorePackage()
  EPackageRegistry.INSTANCE.set(ecore.getNsURI()!, ecore)

  const set = new BasicResourceSet()
  set.getResourceFactoryRegistry().getExtensionToFactoryMap().set('xmi', new XMIResourceFactory())
  const resource = set.createResource(URI.createURI('ecore-class-diagram.xmi'))
  ;(resource as unknown as { loadFromString(s: string): void }).loadFromString(
    readFileSync(`${APP}/public/ecore-class-diagram.xmi`, 'utf8'),
  )
  const errors = resource.getErrors() as unknown
  expect(Array.isArray(errors) ? errors : (errors as { toArray(): unknown[] }).toArray()).toEqual([])
  diagram = resource.getContents().get(0)

  // Als Domäne dient das Diagramm-EPackage selbst — ein echtes EPackage mit
  // abstrakten und konkreten Klassen, Referenzen, Enums und Datentypen.
  ecoreDomain = UimodelDiagramPackage.eINSTANCE as unknown as EObject
})

describe('Ecore-Klassendiagramm', () => {
  it('lädt mit dem neuen nsURI als DiagramModel', () => {
    expect(diagram.eClass().getName()).toBe('DiagramModel')
    const name = diagram.eClass().getEStructuralFeature('name')!
    expect(diagram.eGet(name)).toBe('Ecore Class Diagram')
  })

  it('bleibt ohne Renderer beim Kastenknoten mit Zeilen', () => {
    const result = interpret(diagram, ecoreDomain)
    expect(result.index.size).toBeGreaterThan(10)
    // Kein Rahmen: das Modell kennt keine Gruppierungen.
    expect(result.frames.size).toBe(0)

    let withRows = 0
    for (const ref of result.index.values()) {
      expect(nodeSymbolOf(ref.obj, ref.mapping).shape).toBe('COMPARTMENTS')
      if (rowCount(resolveNodeView(ref.obj, ref.mapping)) > 0) withRows++
    }
    expect(withRows).toBeGreaterThan(10)
  })

  it('bemisst die Knoten nach ihren Zeilen, 220 px breit', () => {
    const result = interpret(diagram, ecoreDomain)
    const flat: any[] = []
    const walk = (children: any[] | undefined) => {
      for (const c of children ?? []) {
        flat.push(c)
        walk(c.children)
      }
    }
    walk(result.graph.children)
    const leaves = flat.filter((c) => !c.children?.length)
    expect(leaves.length).toBeGreaterThan(10)
    for (const leaf of leaves) {
      expect(leaf.width).toBeGreaterThanOrEqual(220)
      expect(leaf.height).toBeGreaterThan(HEADER_H)
    }
  })

  it('fasst Datentypen und Enums in Gruppen-Behälter', () => {
    const result = interpret(diagram, ecoreDomain)
    const groups: string[] = []
    const walk = (children: any[] | undefined) => {
      for (const c of children ?? []) {
        if (c.id.includes('::')) groups.push(c.labels?.[0]?.text ?? '')
        walk(c.children)
      }
    }
    walk(result.graph.children)
    expect(groups).toContain('ENUMERATIONS')
  })

  it('unterscheidet konkrete Klassen, abstrakte und Schnittstellen', () => {
    const result = interpret(diagram, ecoreDomain)
    const stereotypes = new Set<string>()
    for (const ref of result.index.values()) {
      stereotypes.add(resolveNodeView(ref.obj, ref.mapping).stereotype)
    }
    // NodeRenderer und EdgeRenderer sind abstrakt, die übrigen Klassen konkret.
    expect(stereotypes).toContain('Class')
    expect(stereotypes).toContain('abstract Class')
    expect(stereotypes).toContain('Enumeration')
  })

  it('zieht Vererbungskanten mit der Dekoration aus dem Modell', () => {
    const result = interpret(diagram, ecoreDomain)
    const kinds = [...result.edgeMeta.values()].map((m) => m.kind)
    expect(kinds).toContain('INHERITANCE')
    // Ohne EdgeRenderer bleibt das Symbol auf den Grundwerten.
    for (const meta of result.edgeMeta.values()) {
      expect(meta.symbol.width).toBe(1.2)
      expect(meta.symbol.style).toBe('SOLID')
    }
  })

  it('verweist jede Kante auf vorhandene Knoten', () => {
    const result = interpret(diagram, ecoreDomain)
    const ids = new Set<string>()
    const walk = (children: any[] | undefined) => {
      for (const c of children ?? []) {
        ids.add(c.id)
        for (const p of (c.ports ?? []) as { id: string }[]) ids.add(p.id)
        walk(c.children)
      }
    }
    walk(result.graph.children)
    for (const edge of result.graph.edges ?? []) {
      expect(ids.has(edge.sources[0]), `Quelle ${edge.sources[0]} fehlt`).toBe(true)
      expect(ids.has(edge.targets[0]), `Ziel ${edge.targets[0]} fehlt`).toBe(true)
    }
  })
})
