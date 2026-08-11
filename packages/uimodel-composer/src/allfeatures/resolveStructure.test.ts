import { beforeAll, describe, expect, it } from 'vitest';
import {
  BasicEAttribute,
  BasicEClass,
  BasicEPackage,
  BasicEReference,
  getEcorePackage,
  registerEcorePackage,
  type EClass,
  type EObject,
} from '@emfts/core';
import { UimodelPackage } from '../generated/UimodelPackage';
import { UimodelFactory } from '../generated/UimodelFactory';
import type { WidgetComponent } from '../generated/WidgetComponent';
import { resolveStructure } from './resolveStructure';
import { expandFeatures } from './expandFeatures';

let company: EObject;
let personClass: EClass;
let persons: EObject[];

function jsExpr(body: string) {
  const expr = UimodelFactory.eINSTANCE.createExpression();
  expr.language = 'JS';
  expr.body = body;
  return expr;
}

function input(name: string): WidgetComponent {
  const w = UimodelFactory.eINSTANCE.createInputWidget();
  w.name = name;
  return w;
}

beforeAll(() => {
  registerEcorePackage();
  const uimodel = UimodelPackage.eINSTANCE;
  uimodel.setEFactoryInstance(UimodelFactory.eINSTANCE);

  const ecore = getEcorePackage();
  const pkg = new BasicEPackage();
  pkg.setName('t');
  pkg.setNsURI('http://t-structure/1.0');

  personClass = new BasicEClass();
  personClass.setName('Person');
  const nameAttr = new BasicEAttribute();
  nameAttr.setName('name');
  nameAttr.setEType(ecore.getEString());
  personClass.getEStructuralFeatures().add(nameAttr);
  pkg.getEClassifiers().add(personClass);

  const companyClass = new BasicEClass();
  companyClass.setName('Company');
  const lockedAttr = new BasicEAttribute();
  lockedAttr.setName('locked');
  lockedAttr.setEType(ecore.getEBoolean());
  companyClass.getEStructuralFeatures().add(lockedAttr);
  const employeesRef = new BasicEReference();
  employeesRef.setName('employees');
  employeesRef.setEType(personClass);
  employeesRef.setUpperBound(-1);
  employeesRef.setContainment(true);
  companyClass.getEStructuralFeatures().add(employeesRef);
  pkg.getEClassifiers().add(companyClass);

  const factory = pkg.getEFactoryInstance()!;
  company = factory.create(companyClass);
  persons = ['Lena', 'Markus'].map((n) => {
    const p = factory.create(personClass);
    p.eSet(nameAttr, n);
    return p;
  });
  company.eSet(employeesRef, persons);
});

describe('resolveStructure', () => {
  it('lässt normale Widgets und GroupWidgets durch', () => {
    const factory = UimodelFactory.eINSTANCE;
    const group = factory.createGroupWidget();
    group.name = 'g';
    group.fields = [input('inner')];
    const entries = resolveStructure([input('a'), group], company);
    expect(entries.map((e) => e.kind)).toEqual(['widget', 'group']);
  });

  it('Conditional wählt then/else nach condition (self = Domänenobjekt)', () => {
    const factory = UimodelFactory.eINSTANCE;
    const cond = factory.createConditional();
    cond.name = 'c';
    cond.condition = jsExpr('self.locked === true');
    cond.then = [input('locked-note')];
    cond.else = [input('editable')];

    expect(resolveStructure([cond], company).map((e) => (e as { widget: WidgetComponent }).widget.name))
      .toEqual(['editable']);
    company.eSet(company.eClass().getEStructuralFeature('locked')!, true);
    expect(resolveStructure([cond], company).map((e) => (e as { widget: WidgetComponent }).widget.name))
      .toEqual(['locked-note']);
    company.eSet(company.eClass().getEStructuralFeature('locked')!, false);
  });

  it('ForEach rendert body pro Element mit model = Element', () => {
    const factory = UimodelFactory.eINSTANCE;
    const each = factory.createForEach();
    each.name = 'employees';
    each.items = jsExpr('self.employees');
    each.body = [input('row')];

    const entries = resolveStructure([each], company);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => (e as { model: EObject }).model)).toEqual(persons);
  });

  it('ForEach: leere Collection ⇒ emptyText-Note', () => {
    const factory = UimodelFactory.eINSTANCE;
    const each = factory.createForEach();
    each.name = 'none';
    each.items = jsExpr('[]');
    each.body = [input('row')];
    each.emptyText = 'Keine Einträge';
    expect(resolveStructure([each], company)).toEqual([{ kind: 'note', text: 'Keine Einträge' }]);
  });

  it('komponierbar: ForEach → Conditional → AllFeatures', () => {
    const factory = UimodelFactory.eINSTANCE;
    const all = factory.createAllFeatures();
    all.name = 'all';
    all.filter = jsExpr('true');
    const tc = factory.createTemplateCase();
    tc.widget = input('proto');
    all.cases = [tc];

    const cond = factory.createConditional();
    cond.name = 'if';
    cond.condition = jsExpr("self.name === 'Lena'");
    cond.then = [all];

    const each = factory.createForEach();
    each.name = 'each';
    each.items = jsExpr('self.employees');
    each.body = [cond];

    const entries = resolveStructure([each], company);
    // nur Lena erfüllt die Bedingung; ihr einziges Feature (name) expandiert
    expect(entries).toHaveLength(1);
    const entry = entries[0] as { widget: WidgetComponent; model: EObject };
    expect(entry.widget.name).toBe('name');
    expect(entry.model).toBe(persons[0]);
  });
});

describe('komplexe Templates (GroupWidget als Prototyp)', () => {
  it('klont die Gruppe und vererbt das Feature an Nachfahren ohne eigenes', () => {
    const factory = UimodelFactory.eINSTANCE;
    const proto = factory.createGroupWidget();
    proto.name = 'row-proto';
    proto.layout = 'HORIZONTAL' as never;
    const inner = input('value');
    const staticNote = input('hint');
    staticNote.feature = personClass.getEStructuralFeature('name')!; // eigenes feature bleibt
    proto.fields = [inner, staticNote];

    const all = factory.createAllFeatures();
    all.name = 'grouped';
    all.filter = jsExpr("self.name === 'locked'");
    const tc = factory.createTemplateCase();
    tc.widget = proto;
    all.cases = [tc];

    const [widget] = expandFeatures(company.eClass(), all);
    expect(widget.eClass().getName()).toBe('GroupWidget');
    expect(widget).not.toBe(proto);
    const fields = (widget as unknown as { fields: WidgetComponent[] }).fields;
    expect(fields[0].feature?.getName()).toBe('locked'); // geerbt
    expect(fields[1].feature?.getName()).toBe('name');   // eigenes behalten
    // Gruppe selbst bleibt ungebunden
    expect(widget.feature).toBeUndefined();
  });
});
