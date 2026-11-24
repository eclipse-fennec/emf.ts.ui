/**
 * Testdomäne: ein kleines Netz als dynamisches EPackage.
 *
 * Nur für die Tests dieses Pakets — von index.ts nicht importiert und daher
 * nicht im Bundle. Das Modell bildet die Teile des Netzplans nach, an denen die
 * neuen Begriffe hängen: Gerätearten als EEnum, der Standort als Pfadzeichen-
 * kette, Racks mit ihrem Ort, Kabel zwischen Ports zweier Geräte.
 */
import {
  BasicEFactory,
  EAttributeBuilder,
  EClassBuilder,
  EcoreDataTypes,
  EReferenceBuilder,
  SimpleEPackage,
  BasicEEnum,
  BasicEEnumLiteral,
  EPackageRegistry,
  registerEcorePackage,
} from '@emfts/core'
import type { EClass, EObject, EReference, EStructuralFeature } from '@emfts/core'

export interface NetDomain {
  pkg: SimpleEPackage
  factory: BasicEFactory
  classes: Record<'Network' | 'Device' | 'Port' | 'Link' | 'Site' | 'Rack' | 'Mount', EClass>
  /** Jedes Feature unter "<Klasse>.<Feature>" — kürzt die Tests spürbar. */
  f: Record<string, EStructuralFeature>
}

function enumType(name: string, literals: string[]): BasicEEnum {
  const e = new BasicEEnum()
  e.setName(name)
  literals.forEach((literal, i) => {
    const l = new BasicEEnumLiteral()
    l.setName(literal)
    l.setLiteral(literal)
    l.setValue(i)
    e.getELiterals().add(l)
  })
  return e
}

/** Baut das Testpaket und registriert es. */
export function createNetDomain(): NetDomain {
  registerEcorePackage()
  const { EString, EBoolean } = EcoreDataTypes

  const deviceKind = enumType('DeviceKind', ['ROUTER', 'FIREWALL', 'SWITCH', 'SERVER', 'CLIENT'])
  const healthState = enumType('HealthState', ['UNKNOWN', 'OK', 'PROBLEM', 'DOWN'])

  // Klassen zuerst ohne Features, damit sie einander referenzieren können.
  const device = new EClassBuilder('Device').build()
  const port = new EClassBuilder('Port').build()
  const link = new EClassBuilder('Link').build()
  const site = new EClassBuilder('Site').build()
  const rack = new EClassBuilder('Rack').build()
  const mount = new EClassBuilder('Mount').build()
  const network = new EClassBuilder('Network').build()

  const f: Record<string, EStructuralFeature> = {}
  const add = (owner: EClass, feature: EStructuralFeature) => {
    owner.getEStructuralFeatures().add(feature)
    f[`${owner.getName()}.${feature.getName()}`] = feature
    return feature
  }

  add(device, new EAttributeBuilder('name', EString).build())
  add(device, new EAttributeBuilder('kind', deviceKind).defaultValue('CLIENT').build())
  add(device, new EAttributeBuilder('location', EString).build())
  add(device, new EAttributeBuilder('health', healthState).defaultValue('UNKNOWN').build())
  add(device, new EAttributeBuilder('ip', EString).build())

  const portDevice = new EReferenceBuilder('device', device).required().build()
  const devicePorts = new EReferenceBuilder('ports', port).containment().many().build()
  portDevice.setEOpposite(devicePorts)
  devicePorts.setEOpposite(portDevice)
  add(device, devicePorts)
  add(port, new EAttributeBuilder('name', EString).build())
  add(port, portDevice)

  add(device, new EReferenceBuilder('mount', mount).containment().build())
  add(mount, new EReferenceBuilder('rack', rack).required().build())

  add(rack, new EAttributeBuilder('key', EString).build())
  add(rack, new EAttributeBuilder('name', EString).build())
  add(rack, new EAttributeBuilder('units', EString).build())
  add(rack, new EAttributeBuilder('site', EString).build())

  add(site, new EAttributeBuilder('name', EString).build())
  add(site, new EAttributeBuilder('path', EString).build())
  add(site, new EAttributeBuilder('parent', EString).build())
  add(site, new EAttributeBuilder('kind', EString).build())

  add(link, new EReferenceBuilder('a', port).required().build())
  add(link, new EReferenceBuilder('b', port).required().build())
  add(link, new EAttributeBuilder('trunk', EBoolean).build())

  add(network, new EReferenceBuilder('devices', device).containment().many().build())
  add(network, new EReferenceBuilder('links', link).containment().many().build())
  add(network, new EReferenceBuilder('sites', site).containment().many().build())
  add(network, new EReferenceBuilder('racks', rack).containment().many().build())

  const factory = new BasicEFactory()
  const pkg = SimpleEPackage.create({
    name: 'netztest',
    nsURI: 'http://netztest/1.0',
    nsPrefix: 'netztest',
    factory,
  })
  for (const c of [network, device, port, link, site, rack, mount]) pkg.withClassifier(c)
  pkg.withClassifier(deviceKind)
  pkg.withClassifier(healthState)
  factory.setEPackage(pkg)
  EPackageRegistry.INSTANCE.set(pkg.getNsURI()!, pkg)

  return {
    pkg,
    factory,
    classes: { Network: network, Device: device, Port: port, Link: link, Site: site, Rack: rack, Mount: mount },
    f,
  }
}

/** Setzt ein Feature eines Objekts über seinen Namen. */
export function set(obj: EObject, name: string, value: unknown): void {
  const feature = obj.eClass().getEStructuralFeature(name)
  if (!feature) throw new Error(`Kein Feature "${name}" an ${obj.eClass().getName()}`)
  obj.eSet(feature, value)
}

/** Hängt ein Objekt an eine mehrwertige Referenz. */
export function addTo(owner: EObject, name: string, value: EObject): void {
  const feature = owner.eClass().getEStructuralFeature(name)
  if (!feature) throw new Error(`Kein Feature "${name}" an ${owner.eClass().getName()}`)
  ;(owner.eGet(feature) as { add(v: EObject): void }).add(value)
}

/** Die Pfadliste einer geordneten EReference-Referenz eines Mappings füllen. */
export function setPath(obj: EObject, name: string, path: EStructuralFeature[]): void {
  const feature = obj.eClass().getEStructuralFeature(name)
  if (!feature) throw new Error(`Kein Feature "${name}" an ${obj.eClass().getName()}`)
  const list = obj.eGet(feature) as { add(v: unknown): void }
  for (const step of path) list.add(step as unknown as EReference)
}
