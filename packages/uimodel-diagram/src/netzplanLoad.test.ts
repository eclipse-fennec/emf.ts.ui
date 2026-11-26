/**
 * Lädt die Beispiel-Netzdaten der example-App und prüft, dass die Referenzen
 * auflösen — Verkabelung, Einbau im Rack, VLANs der IP-Netze.
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

const APP = resolve(__dirname, '../../../apps/example')

let net: EObject

function get(o: EObject, name: string): any {
  const f = o.eClass().getEStructuralFeature(name)
  if (!f) throw new Error(`Kein Feature "${name}" an ${o.eClass().getName()}`)
  return o.eGet(f)
}

function list(o: EObject, name: string): EObject[] {
  return (get(o, name) as EList<EObject>).toArray()
}

beforeAll(async () => {
  registerEcorePackage()
  // Die generierten Klassen der example-App liegen außerhalb dieses Pakets;
  // der Import über den Pfad hält den Test unabhängig von einem Build der App.
  const { NetzplanPackage, NetzplanFactory } = await import(
    `${APP}/src/generated/netzplan/index.ts`
  )
  const pkg = NetzplanPackage.eINSTANCE
  pkg.setEFactoryInstance(NetzplanFactory.eINSTANCE)
  EPackageRegistry.INSTANCE.set(pkg.getNsURI()!, pkg)

  const set = new BasicResourceSet()
  set.getResourceFactoryRegistry().getExtensionToFactoryMap().set('xmi', new XMIResourceFactory())
  const resource = set.createResource(URI.createURI('netzplan.xmi'))
  ;(resource as unknown as { loadFromString(s: string): void }).loadFromString(
    readFileSync(`${APP}/public/netzplan.xmi`, 'utf8'),
  )
  const errors = resource.getErrors() as unknown
  expect(Array.isArray(errors) ? errors : (errors as { toArray(): unknown[] }).toArray()).toEqual([])
  net = resource.getContents().get(0)
})

describe('Beispiel-Netzdaten', () => {
  it('lädt Geräte, Kabel, Orte und Netze', () => {
    expect(list(net, 'devices')).toHaveLength(14)
    expect(list(net, 'links')).toHaveLength(13)
    expect(list(net, 'sites')).toHaveLength(5)
    expect(list(net, 'racks')).toHaveLength(1)
    expect(list(net, 'networks')).toHaveLength(3)
    expect(list(net, 'vlans')).toHaveLength(4)
  })

  it('jeder Port kennt sein Gerät über die Rückreferenz', () => {
    // Device.ports ist Containment mit eOpposite Port.device. Der
    // generierte Code pflegt die Gegenseite seit @emfts/codegen
    // 0.0.2-next.14; davor blieb Port.device null, und alles musste über
    // eContainer() aufsteigen.
    const ports = list(net, 'devices').flatMap((device) =>
      list(device, 'ports').map((port) => ({ device, port })),
    )
    expect(ports.length).toBeGreaterThan(0)
    for (const { device, port } of ports) {
      expect(get(port, 'device'), `Port ${get(port, 'id')} ohne Gerät`).toBe(device)
      expect(port.eContainer()).toBe(device)
    }
  })

  it('löst jedes Kabel auf zwei Ports verschiedener Geräte auf', () => {
    for (const link of list(net, 'links')) {
      const a = get(link, 'a') as EObject | null
      const b = get(link, 'b') as EObject | null
      expect(a, `link ${get(link, 'id')} ohne a`).toBeTruthy()
      expect(b, `link ${get(link, 'id')} ohne b`).toBeTruthy()
      const deviceA = a!.eContainer() as EObject
      const deviceB = b!.eContainer() as EObject
      expect(get(deviceA, 'name')).not.toBe(get(deviceB, 'name'))
    }
  })

  it('kennt zu jedem Einbau das Rack und den Serverraum', () => {
    const mounted = list(net, 'devices').filter((d) => get(d, 'mount'))
    expect(mounted).toHaveLength(6)
    for (const device of mounted) {
      const mount = get(device, 'mount') as EObject
      expect(get(get(mount, 'rack') as EObject, 'name')).toBe('Rack A1')
      expect(get(get(mount, 'room') as EObject, 'kind')).toBe('ROOM')
      expect(get(get(mount, 'datacenter') as EObject, 'kind')).toBe('DATACENTER')
    }
  })

  it('verweist von jedem IP-Netz auf sein VLAN', () => {
    for (const ipNet of list(net, 'networks')) {
      const vlans = list(ipNet, 'vlans')
      expect(vlans).toHaveLength(1)
      expect(get(vlans[0], 'tag')).toBeGreaterThan(0)
    }
  })

  it('führt jeden Standort eines Geräts auch als Ort', () => {
    const paths = new Set(list(net, 'sites').map((s) => String(get(s, 'path'))))
    for (const device of list(net, 'devices')) {
      const location = String(get(device, 'location') ?? '')
      expect(paths.has(location), `Standort "${location}" fehlt unter sites`).toBe(true)
    }
    // Das Rack steht in einem Ort, den es gibt.
    expect(paths.has(String(get(list(net, 'racks')[0], 'site')))).toBe(true)
  })
})
