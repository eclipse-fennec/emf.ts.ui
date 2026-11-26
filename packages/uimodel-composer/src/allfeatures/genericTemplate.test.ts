/**
 * Ende-zu-Ende: generic-default.uimodel.xmi laden (templates-Katalog,
 * template-href, PropertyBinding) und gegen eine Test-EClass expandieren.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  BasicEAnnotation,
  BasicEAttribute,
  BasicEClass,
  BasicEReference,
  BasicEPackage,
  BasicResourceSet,
  EPackageRegistry,
  getEcorePackage,
  registerEcorePackage,
  URI,
  XMIResourceFactory,
  type EClass,
  type EObject,
  type XMIResource,
} from '@emfts/core';
import { UimodelPackage } from '../generated/UimodelPackage';
import { UimodelFactory } from '../generated/UimodelFactory';
import type { UIModel } from '../generated/UIModel';
import type { AllFeatures } from '../generated/AllFeatures';
import { collectExpansionContext, expandFeatures } from './expandFeatures';
import { resolveBindings } from '../utils/resolveBindings';
import { resolveCrossResourceProxies } from '../utils/resolveProxies';

const TEMPLATE_XMI = readFileSync(
  resolve(__dirname, '../../model/templates/generic-default.uimodel.xmi'),
  'utf-8'
);

let uiModel: UIModel;
let person: EClass;
let model: EObject;

beforeAll(() => {
  registerEcorePackage();
  const uimodel = UimodelPackage.eINSTANCE;
  uimodel.setEFactoryInstance(UimodelFactory.eINSTANCE);
  EPackageRegistry.INSTANCE.set(uimodel.getNsURI()!, uimodel);

  const rs = new BasicResourceSet();
  rs.getResourceFactoryRegistry().getExtensionToFactoryMap().set('xmi', new XMIResourceFactory());
  const res = rs.createResource(URI.createURI('/generic-default.uimodel.xmi')) as XMIResource;
  res.loadFromString(TEMPLATE_XMI);
  uiModel = res.getContents().get(0) as UIModel;
  resolveCrossResourceProxies(res);

  const ecore = getEcorePackage();
  const pkg = new BasicEPackage();
  pkg.setName('t');
  pkg.setNsURI('http://t-generic/1.0');
  person = new BasicEClass();
  person.setName('Person');
  for (const name of ['firstName', 'jobTitle']) {
    const attr = new BasicEAttribute();
    attr.setName(name);
    attr.setEType(ecore.getEString());
    person.getEStructuralFeatures().add(attr);
  }
  pkg.getEClassifiers().add(person);
  model = pkg.getEFactoryInstance()!.create(person);
});

function allFeaturesIn(formName: string): AllFeatures {
  const form = uiModel.components.find((c) => c.name === formName) as unknown as {
    fields: AllFeatures[];
  };
  return form.fields[0];
}

describe('generic-default.uimodel.xmi', () => {
  it('Struktur: FormView pro Sektion mit AllFeatures-Platzhalter in fields (Issue #4)', () => {
    expect(uiModel.components.map((c) => c.eClass().getName()))
      .toEqual(['FormView', 'FormView', 'FormView', 'FormView', 'FormView']);
    expect(uiModel.components.map((c) => c.name)).toEqual([
      'identification',
      'attributes',
      'containments',
      'references',
      'derived',
    ]);
    const attribute = allFeaturesIn('attributes');
    expect(attribute.eClass().getName()).toBe('AllFeatures');
    expect(attribute.bindings).toHaveLength(1);
    expect(attribute.bindings[0].property).toBe('label');
    expect(attribute.template).toBeUndefined();
  });

  it('expandiert mit Typ-Mapping und geerbtem Binding', () => {
    const ctx = collectExpansionContext(uiModel as unknown as EObject);
    const widgets = expandFeatures(person, allFeaturesIn('attributes'), ctx);
    expect(widgets.map((w) => w.name)).toEqual(['firstName', 'jobTitle']);
    // ohne Template greift das Typ-Mapping
    expect(widgets.map((w) => w.eClass().getName())).toEqual(['InputWidget', 'InputWidget']);
    // geerbtes Binding liefert das abgeleitete Label
    expect(resolveBindings(widgets[0], model).values.label).toBe('First Name');
    expect(resolveBindings(widgets[1], model).values.label).toBe('Job Title');
  });

  it('Label-Binding liest die EAnnotation am Feature (Issue #18)', () => {
    // Ohne getByKey liefert EList.get('label') still undefined — das Label
    // fiele dann auf die Namensableitung 'Delivery Date' zurück.
    const ecore = getEcorePackage();
    const pkg = new BasicEPackage();
    pkg.setName('t2');
    pkg.setNsURI('http://t-generic/annotated');
    const order = new BasicEClass();
    order.setName('Order');
    const attr = new BasicEAttribute();
    attr.setName('deliveryDate');
    attr.setEType(ecore.getEString());
    const annotation = new BasicEAnnotation();
    annotation.setSource('http://uimodel/1.0');
    annotation.getDetails().putByKey('label', 'Liefertermin');
    attr.getEAnnotations().add(annotation);
    order.getEStructuralFeatures().add(attr);
    pkg.getEClassifiers().add(order);
    const orderObject = pkg.getEFactoryInstance()!.create(order);

    const ctx = collectExpansionContext(uiModel as unknown as EObject);
    const widgets = expandFeatures(order, allFeaturesIn('attributes'), ctx);
    expect(widgets).toHaveLength(1);
    expect(resolveBindings(widgets[0], orderObject).values.label).toBe('Liefertermin');
  });

  it('mehrwertige Attribute bekommen eine Liste (Issue #24)', () => {
    const ecore = getEcorePackage();
    const pkg = new BasicEPackage();
    pkg.setName('t3');
    pkg.setNsURI('http://t-generic/many');
    const article = new BasicEClass();
    article.setName('Article');
    const tags = new BasicEAttribute();
    tags.setName('tags');
    tags.setEType(ecore.getEString());
    tags.setUpperBound(-1);
    const title = new BasicEAttribute();
    title.setName('title');
    title.setEType(ecore.getEString());
    article.getEStructuralFeatures().add(tags);
    article.getEStructuralFeatures().add(title);
    pkg.getEClassifiers().add(article);

    const ctx = collectExpansionContext(uiModel as unknown as EObject);
    const widgets = expandFeatures(article, allFeaturesIn('attributes'), ctx);
    const byName = new Map(widgets.map((w) => [w.name, w.eClass().getName()]));
    expect(byName.get('tags')).toBe('ListWidget');
    // einwertig bleibt beim Datentyp
    expect(byName.get('title')).toBe('InputWidget');
  });

  it('Containments bekommen ein Unterformular, Referenzen einen Link (Issue #25)', () => {
    const ecore = getEcorePackage();
    const pkg = new BasicEPackage();
    pkg.setName('t4');
    pkg.setNsURI('http://t-generic/containment');
    const address = new BasicEClass();
    address.setName('Address');
    const street = new BasicEAttribute();
    street.setName('street');
    street.setEType(ecore.getEString());
    address.getEStructuralFeatures().add(street);
    const order = new BasicEClass();
    order.setName('Order');
    const addressRef = new BasicEReference();
    addressRef.setName('address');
    addressRef.setEType(address);
    addressRef.setContainment(true);
    const customerRef = new BasicEReference();
    customerRef.setName('customer');
    customerRef.setEType(address);
    order.getEStructuralFeatures().add(addressRef);
    order.getEStructuralFeatures().add(customerRef);
    pkg.getEClassifiers().add(address);
    pkg.getEClassifiers().add(order);

    const ctx = collectExpansionContext(uiModel as unknown as EObject);
    const containments = expandFeatures(order, allFeaturesIn('containments'), ctx);
    expect(containments.map((w) => [w.name, w.eClass().getName()])).toEqual([
      ['address', 'SubFormWidget'],
    ]);
    // der Prototyp bringt die Felder des Kindes mit
    expect(containments[0].eClass().getName()).toBe('SubFormWidget');
    expect(
      (containments[0] as unknown as { fields: { eClass(): { getName(): string } }[] }).fields
        .map((f) => f.eClass().getName())
    ).toEqual(['AllFeatures']);

    const references = expandFeatures(order, allFeaturesIn('references'), ctx);
    expect(references.map((w) => [w.name, w.eClass().getName()])).toEqual([
      ['customer', 'ReferenceLinkWidget'],
    ]);
  });

  it('ein AllFeatures im Prototypen-Katalog nimmt keine Features weg', () => {
    // Regression: collectExpansionContext lief in UIModel.templates hinein,
    // der AllFeatures-Block des SubFormWidget-Prototyps gewann dort die
    // Zuordnung — die Attribut-Sektion blieb leer.
    const ctx = collectExpansionContext(uiModel as unknown as EObject);
    const catalogBlocks = ctx.blocks.filter((b) => b.name === 'child');
    expect(catalogBlocks).toHaveLength(0);
    expect(expandFeatures(person, allFeaturesIn('attributes'), ctx)).toHaveLength(2);
  });

  it('geerbte Widget-Defaults: readOnly des derived-Platzhalters', () => {
    const ctx = collectExpansionContext(uiModel as unknown as EObject);
    const derivedBlock = allFeaturesIn('derived');
    expect(String(derivedBlock.readOnly)).toBe('true');
    // Person hat keine derived Features → leer, aber Block-Default geprüft
    expect(expandFeatures(person, derivedBlock, ctx)).toEqual([]);
  });
});

describe('templates-Katalog + template-href (Vorlagen-Mechanik)', () => {
  const CATALOG_XMI = `<?xml version="1.0" encoding="UTF-8"?>
<uimodel:UIModel xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:uimodel="http://uimodel/1.0" name="with-catalog">
  <templates xsi:type="uimodel:TextAreaWidget" xmi:id="multiline" name="multiline" rows="6"/>
  <components xsi:type="uimodel:AllFeatures" name="described">
    <filter language="JS" body="self.name === 'firstName'"/>
    <template href="#multiline"/>
  </components>
</uimodel:UIModel>`;

  it('löst den Katalog-href auf und klont pro Treffer', () => {
    const rs = uiModel.eResource()!.getResourceSet()!;
    const res = rs.createResource(URI.createURI('/with-catalog.xmi')) as XMIResource;
    res.loadFromString(CATALOG_XMI);
    const catalogModel = res.getContents().get(0) as UIModel;
    resolveCrossResourceProxies(res);

    expect(catalogModel.templates).toHaveLength(1);
    const described = catalogModel.components.find((c) => c.name === 'described') as AllFeatures;
    expect(described.template).toBe(catalogModel.templates[0]);

    const widgets = expandFeatures(person, described);
    expect(widgets).toHaveLength(1);
    expect(widgets[0].eClass().getName()).toBe('TextAreaWidget');
    expect(widgets[0]).not.toBe(catalogModel.templates[0]);
    expect(catalogModel.templates[0].feature).toBeUndefined();
  });
});
