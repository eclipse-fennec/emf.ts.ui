/**
 * Reflektive Helfer über dem Ecore-Metamodell: Labels, Containment-Baum,
 * instanziierbare Subklassen und Referenz-Kandidaten.
 */
import type {
  EClass,
  EClassifier,
  EObject,
  EPackage,
  EReference,
  EStructuralFeature,
  Resource,
} from '@emfts/core';

export function isEClass(classifier: EClassifier | null | undefined): classifier is EClass {
  return !!classifier && typeof (classifier as EClass).getESuperTypes === 'function';
}

export function isReference(feature: EStructuralFeature): feature is EReference {
  return typeof (feature as EReference).isContainment === 'function';
}

export function isContainment(feature: EStructuralFeature): boolean {
  return isReference(feature) && feature.isContainment();
}

export function isEnumType(feature: EStructuralFeature): boolean {
  const t = feature.getEType();
  return !!t && typeof (t as { getELiterals?: unknown }).getELiterals === 'function';
}

/** Anzeige-Label eines EObjects: EClass-Name + sprechendes Attribut. */
export function labelFor(obj: EObject | null | undefined): string {
  if (!obj) return '—';
  const eClass = obj.eClass?.();
  const className = eClass?.getName?.() ?? '?';
  for (const attr of ['name', 'property', 'label', 'value', 'state', 'body']) {
    const f = eClass?.getEStructuralFeature?.(attr);
    if (f) {
      const v = obj.eGet(f);
      if (v !== undefined && v !== null && v !== '') {
        return `${className} „${String((v as { getName?: () => string }).getName?.() ?? v)}“`;
      }
    }
  }
  return className;
}

/** Alle Containment-Referenzen einer EClass. */
export function containmentFeatures(eClass: EClass): EReference[] {
  return eClass
    .getEAllStructuralFeatures()
    .filter((f): f is EReference => isContainment(f));
}

/** Kinder eines EObjects, gruppiert nach Containment-Feature. */
export function childrenByFeature(obj: EObject): { feature: EReference; children: EObject[] }[] {
  const result: { feature: EReference; children: EObject[] }[] = [];
  for (const feature of containmentFeatures(obj.eClass())) {
    const value = obj.eGet(feature);
    if (!value) continue;
    const children = feature.isMany()
      ? Array.from(value as Iterable<EObject>)
      : [value as EObject];
    if (children.length > 0) result.push({ feature, children });
  }
  return result;
}

/** Konkrete (instanziierbare) EClasses eines Typs aus den gegebenen Packages. */
export function concreteSubclasses(
  eType: EClassifier | null,
  packages: EPackage[]
): EClass[] {
  if (!isEClass(eType)) return [];
  const result: EClass[] = [];
  for (const pkg of packages) {
    for (const classifier of pkg.getEClassifiers()) {
      if (!isEClass(classifier)) continue;
      if (classifier.isAbstract() || classifier.isInterface()) continue;
      if (classifier === eType || eType.isSuperTypeOf(classifier)) {
        result.push(classifier);
      }
    }
  }
  return result;
}

/** Alle Instanzen eines Typs, erreichbar über die geladenen Resources. */
export function reachableInstances(eType: EClassifier | null, resources: Resource[]): EObject[] {
  if (!isEClass(eType)) return [];
  const result: EObject[] = [];
  const visit = (obj: EObject) => {
    const eClass = obj.eClass?.();
    if (eClass && (eClass === eType || eType.isSuperTypeOf(eClass))) {
      result.push(obj);
    }
  };
  for (const resource of resources) {
    for (const root of resource.getContents()) {
      visit(root);
      for (const child of root.eAllContents()) visit(child);
    }
  }
  return result;
}
