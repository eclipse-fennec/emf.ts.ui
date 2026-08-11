/**
 * Löst Cross-Resource-Proxies einer Resource auf (z. B. Component.styles
 * → styles.xmi#id).
 *
 * Hintergrund: EcoreUtil.resolveAll/@emfts/core eResolveProxy rufen
 * base.resolve(relative) auf — URI.resolve erwartet aber die umgekehrte
 * Reihenfolge (relative.resolve(base)), wodurch relative hrefs wie
 * "styles.xmi#s-accent" nie aufgelöst werden. Diese Utility macht die
 * Auflösung mit korrekter URI-Reihenfolge und ersetzt die Proxies in
 * den Referenzlisten.
 */
import { URI, type EObject, type Resource } from '@emfts/core';

interface ProxyLike extends EObject {
  eIsProxy(): boolean;
  eProxyURI(): { toString(): string } | null;
}

function isProxy(value: unknown): value is ProxyLike {
  const v = value as ProxyLike | null;
  return !!v && typeof v.eIsProxy === 'function' && v.eIsProxy();
}

function resolveProxy(proxy: ProxyLike, resource: Resource): EObject {
  const rs = resource.getResourceSet();
  const proxyURI = proxy.eProxyURI();
  if (!proxyURI) return proxy;

  const uriStr = proxyURI.toString();
  const hashIndex = uriStr.indexOf('#');

  if (hashIndex > 0) {
    const resourcePart = uriStr.substring(0, hashIndex);
    const fragment = uriStr.substring(hashIndex + 1);
    if (!rs) return proxy;

    const base = resource.getURI();
    const candidates: string[] = [];
    if (base && !resourcePart.includes('://')) {
      // korrekte Reihenfolge: relative.resolve(base)
      candidates.push(URI.createURI(resourcePart).resolve(base).toString());
    }
    candidates.push(resourcePart);

    for (const candidate of candidates) {
      const target = rs.getResource(URI.createURI(candidate), false);
      const resolved = target?.getEObject(fragment);
      if (resolved) return resolved;
    }
    return proxy;
  }

  // Same-Resource-Referenz (#id oder id)
  const fragment = hashIndex === 0 ? uriStr.substring(1) : uriStr;
  return resource.getEObject(fragment) ?? proxy;
}

function resolveInObject(obj: EObject, resource: Resource): void {
  for (const feature of obj.eClass().getEAllReferences()) {
    const value = obj.eGet(feature);
    if (!value) continue;
    if (feature.isMany()) {
      const list = value as EObject[];
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (isProxy(item)) {
          const resolved = resolveProxy(item, resource);
          if (resolved !== item) list[i] = resolved;
        }
      }
    } else if (isProxy(value)) {
      const resolved = resolveProxy(value as ProxyLike, resource);
      if (resolved !== value) obj.eSet(feature, resolved);
    }
  }
}

/** Löst alle Cross-Resource-Proxies in der Resource auf. */
export function resolveCrossResourceProxies(resource: Resource): void {
  for (const root of resource.getContents()) {
    resolveInObject(root, resource);
    for (const child of root.eAllContents()) {
      resolveInObject(child, resource);
    }
  }
}
