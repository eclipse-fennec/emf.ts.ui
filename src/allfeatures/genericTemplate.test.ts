/**
 * Ende-zu-Ende: generic-default.uimodel.xmi laden (templates-Katalog,
 * template-href, PropertyBinding) und gegen eine Test-EClass expandieren.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  BasicEAttribute,
  BasicEClass,
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
      .toEqual(['FormView', 'FormView', 'FormView', 'FormView']);
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
