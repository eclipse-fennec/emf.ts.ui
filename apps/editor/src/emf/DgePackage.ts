/**
 * Programmatische DGE-Package-Registrierung.
 * Spiegelt dge.ecore wider (nsURI: https://dg.de/1.0)
 */
import {
  BasicEPackage,
  BasicEClass,
  BasicEAttribute,
  BasicEReference,
  BasicEFactory,
  getEcorePackage,
} from '@emfts/core';
import type { EPackage, EClass } from '@emfts/core';

class DgePackageImpl extends BasicEPackage {
  static readonly NS_URI    = 'https://dg.de/1.0';
  static readonly NS_PREFIX = 'dge';

  private static _instance: DgePackageImpl;

  static get eINSTANCE(): DgePackageImpl {
    if (!this._instance) {
      this._instance = new DgePackageImpl();
      this._instance._init();
    }
    return this._instance;
  }

  // EClass accessors
  personClass!:  EClass;
  addressClass!: EClass;
  companyClass!: EClass;

  private _init() {
    this.setName('dge');
    this.setNsURI(DgePackageImpl.NS_URI);
    this.setNsPrefix(DgePackageImpl.NS_PREFIX);

    const eString = getEcorePackage().getEString();

    // ── Address ─────────────────────────────────────────────────────────────
    const address = new BasicEClass();
    address.setName('Address');
    this.addAttr(address, 'street',  eString);
    this.addAttr(address, 'city',    eString);
    this.addAttr(address, 'zipCode', eString);
    this.addAttr(address, 'country', eString);
    this.getEClassifiers().add(address);
    this.addressClass = address;

    // ── Company ──────────────────────────────────────────────────────────────
    const company = new BasicEClass();
    company.setName('Company');
    this.addAttr(company, 'name',     eString);
    this.addAttr(company, 'industry', eString);
    this.addAttr(company, 'url',      eString);
    this.getEClassifiers().add(company);
    this.companyClass = company;

    // ── Person ───────────────────────────────────────────────────────────────
    const person = new BasicEClass();
    person.setName('Person');
    this.addAttr(person, 'firstName', eString);
    this.addAttr(person, 'lastName',  eString);
    this.addAttr(person, 'email',     eString);
    this.addAttr(person, 'phone',     eString);
    this.addAttr(person, 'jobTitle',  eString);
    // Person.address  → Address (non-containment)
    const addrRef = new BasicEReference();
    addrRef.setName('address');
    addrRef.setEType(address);
    addrRef.setContainment(false);
    person.getEStructuralFeatures().add(addrRef);
    // Person.company → Company (non-containment)
    const compRef = new BasicEReference();
    compRef.setName('company');
    compRef.setEType(company);
    compRef.setContainment(false);
    person.getEStructuralFeatures().add(compRef);
    this.getEClassifiers().add(person);
    this.personClass = person;

    // ── Company.address (containment) & Company.employees ────────────────────
    const compAddrRef = new BasicEReference();
    compAddrRef.setName('address');
    compAddrRef.setEType(address);
    compAddrRef.setContainment(true);
    company.getEStructuralFeatures().add(compAddrRef);

    const employeesRef = new BasicEReference();
    employeesRef.setName('employees');
    employeesRef.setEType(person);
    employeesRef.setContainment(true);
    employeesRef.setUpperBound(-1);
    company.getEStructuralFeatures().add(employeesRef);

    // Factory
    const factory = new BasicEFactory();
    factory.setEPackage(this as unknown as EPackage);
    this.setEFactoryInstance(factory);
  }

  private addAttr(cls: BasicEClass, name: string, type: ReturnType<typeof getEcorePackage>['getEString'] extends () => infer T ? T : never) {
    const attr = new BasicEAttribute();
    attr.setName(name);
    attr.setEType(type);
    cls.getEStructuralFeatures().add(attr);
  }
}

export const DgePackage = DgePackageImpl;
