/**
 * Runtime-Fixup für generierte EPackages: emfts-codegen setzt eType nur
 * für EReferences — EAttribute bleiben ohne Typ und EEnums werden gar
 * nicht als Classifier registriert. Für reflektive Editoren (Property-
 * Panel: Checkbox/Number/Enum-Select) werden die Typinformationen hier
 * aus der originalen .ecore-Datei nachgetragen.
 */
import {
  BasicEEnum,
  BasicEEnumLiteral,
  getEcorePackage,
  type EClass,
  type EClassifier,
  type EPackage,
} from '@emfts/core';

type MutableAttribute = { getEType(): EClassifier | null; setEType(t: EClassifier): void };

function ecoreDataType(name: string): EClassifier | undefined {
  const ecore = getEcorePackage();
  const getter = (ecore as unknown as Record<string, (() => EClassifier) | undefined>)[`get${name}`];
  return typeof getter === 'function' ? getter.call(ecore) : undefined;
}

export function applyEcoreAttributeTypes(pkg: EPackage, ecoreXml: string): void {
  const doc = new DOMParser().parseFromString(ecoreXml, 'application/xml');
  const classifierEls = Array.from(doc.getElementsByTagName('eClassifiers'));

  // 1. Fehlende EEnums als Classifier nachregistrieren
  for (const el of classifierEls) {
    if (el.getAttribute('xsi:type') !== 'ecore:EEnum') continue;
    const name = el.getAttribute('name');
    if (!name || pkg.getEClassifier(name)) continue;
    const eEnum = new BasicEEnum();
    eEnum.setName(name);
    let index = 0;
    for (const litEl of Array.from(el.getElementsByTagName('eLiterals'))) {
      const literal = new BasicEEnumLiteral();
      const litName = litEl.getAttribute('name') ?? `L${index}`;
      literal.setName(litName);
      literal.setLiteral(litEl.getAttribute('literal') ?? litName);
      literal.setValue(Number(litEl.getAttribute('value') ?? index));
      eEnum.getELiterals().push(literal);
      index++;
    }
    (pkg.getEClassifiers() as unknown as EClassifier[]).push(eEnum);
  }

  // 2. eType für EAttribute setzen (Ecore-Datentypen oder Package-Enums)
  for (const el of classifierEls) {
    if (el.getAttribute('xsi:type') !== 'ecore:EClass') continue;
    const className = el.getAttribute('name');
    const eClass = className ? (pkg.getEClassifier(className) as EClass | null) : null;
    if (!eClass || typeof eClass.getEStructuralFeature !== 'function') continue;

    for (const featEl of Array.from(el.getElementsByTagName('eStructuralFeatures'))) {
      if (featEl.parentElement !== el) continue;
      if (featEl.getAttribute('xsi:type') !== 'ecore:EAttribute') continue;
      const featureName = featEl.getAttribute('name');
      const eTypeRef = featEl.getAttribute('eType') ?? '';
      if (!featureName || !eTypeRef) continue;

      const feature = eClass.getEStructuralFeature(featureName) as MutableAttribute | null;
      if (!feature || feature.getEType()) continue;

      const typeName = eTypeRef.split('#//').pop() ?? '';
      const target = typeName.startsWith('E')
        ? ecoreDataType(typeName) ?? pkg.getEClassifier(typeName)
        : pkg.getEClassifier(typeName) ?? ecoreDataType(typeName);
      if (target) feature.setEType(target as EClassifier);
    }
  }
}
