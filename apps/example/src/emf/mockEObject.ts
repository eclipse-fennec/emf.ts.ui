/**
 * Minimal EObject/EClass/EStructuralFeature builders for examples.
 * Produces objects that satisfy the @emfts/core structural contracts
 * without requiring a full XMI resource load.
 */
import type { EObject, EClass, EAttribute } from '@emfts/core';

// ---------------------------------------------------------------------------
// EClass

export function mockEClass(name: string): EClass {
  const cls: Partial<EClass> = {
    getName: () => name,
    eClass: () => mockEClass('EClass') as EClass,
    getEStructuralFeature: (nameOrId: string | number) => null,
    getEAllStructuralFeatures: () => [],
    eGet: () => undefined,
  };
  return cls as EClass;
}

// ---------------------------------------------------------------------------
// EAttribute (EString only for now)

export function mockEAttribute(
  name: string,
  containingClass: EClass
): EAttribute {
  const stringType = { getName: () => 'EString', eClass: () => mockEClass('EDataType') };
  const attr: Partial<EAttribute> = {
    getName: () => name,
    eClass: () => mockEClass('EAttribute') as EClass,
    getEType: () => stringType as never,
    getEAttributeType: () => stringType as never,
    getEContainingClass: () => containingClass,
    isMany: () => false,
  };
  return attr as EAttribute;
}

// ---------------------------------------------------------------------------
// EObject instance

export type StringRecord = Record<string, string | undefined>;

export function mockEObject(
  eClass: EClass,
  data: StringRecord
): EObject {
  const base: EObject = {
    eClass: () => eClass,
    eGet: (feature) => {
      const name = typeof feature === 'string' ? feature : (feature as EAttribute).getName?.();
      return name ? data[name] : undefined;
    },
    eSet: (feature, value) => {
      const name = typeof feature === 'string' ? feature : (feature as EAttribute).getName?.();
      if (name) (data as Record<string, unknown>)[name] = value;
    },
    eIsSet: (feature) => {
      const name = typeof feature === 'string' ? feature : (feature as EAttribute).getName?.();
      return name ? data[name] !== undefined : false;
    },
    eUnset: (feature) => {
      const name = typeof feature === 'string' ? feature : (feature as EAttribute).getName?.();
      if (name) delete data[name];
    },
    eResource: () => null,
    eContainer: () => null,
    eContainingFeature: () => null,
    eContainmentFeature: () => null,
    eContents: () => [],
    eAllContents: () => [][Symbol.iterator](),
    eIsProxy: () => false,
    eCrossReferences: () => [],
    eInvoke: () => { throw new Error('not implemented'); },
  };

  // Proxy: erlaubt `self.firstName` in JS-Ausdrücken (Validatoren, Expressions)
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
      if (typeof prop === 'string') return data[prop];
      return undefined;
    },
    set(target, prop, value) {
      if (prop in target) {
        (target as Record<string | symbol, unknown>)[prop] = value;
      } else if (typeof prop === 'string') {
        data[prop] = value as string;
      }
      return true;
    },
  });
}
