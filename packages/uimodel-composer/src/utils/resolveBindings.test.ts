import { beforeAll, describe, expect, it } from 'vitest';
import {
  BasicEAttribute,
  BasicEClass,
  BasicEPackage,
  getEcorePackage,
  registerEcorePackage,
  type EClass,
  type EObject,
  type EStructuralFeature,
} from '@emfts/core';
import { UimodelPackage } from '../generated/UimodelPackage';
import { UimodelFactory } from '../generated/UimodelFactory';
import type { InputWidget } from '../generated/InputWidget';
import { evaluateValue } from './evaluateExpression';
import { resolveBindings } from './resolveBindings';

let person: EClass;
let firstName: EStructuralFeature;
let locked: EStructuralFeature;
let model: EObject;

beforeAll(() => {
  registerEcorePackage();
  const uimodel = UimodelPackage.eINSTANCE;
  uimodel.setEFactoryInstance(UimodelFactory.eINSTANCE);

  const ecore = getEcorePackage();
  const pkg = new BasicEPackage();
  pkg.setName('t');
  pkg.setNsURI('http://t-bindings/1.0');

  person = new BasicEClass();
  person.setName('Person');
  const fn = new BasicEAttribute();
  fn.setName('firstName');
  fn.setEType(ecore.getEString());
  const lk = new BasicEAttribute();
  lk.setName('locked');
  lk.setEType(ecore.getEBoolean());
  person.getEStructuralFeatures().add(fn);
  person.getEStructuralFeatures().add(lk);
  pkg.getEClassifiers().add(person);
  firstName = fn;
  locked = lk;

  model = pkg.getEFactoryInstance()!.create(person);
  model.eSet(firstName, 'Lena');
  model.eSet(locked, true);
});

function jsExpr(body: string) {
  const expr = UimodelFactory.eINSTANCE.createExpression();
  expr.language = 'JS';
  expr.body = body;
  return expr;
}

function widgetWithBinding(property: string, body: string): InputWidget {
  const factory = UimodelFactory.eINSTANCE;
  const widget = factory.createInputWidget();
  widget.name = 'w';
  widget.feature = firstName;
  const binding = factory.createPropertyBinding();
  binding.property = property;
  binding.expression = jsExpr(body);
  widget.bindings = [binding];
  return widget;
}

describe('evaluateValue', () => {
  it('evaluates JS with self and extras (feature/eClass)', () => {
    expect(evaluateValue(jsExpr('self.firstName'), model)).toBe('Lena');
    expect(
      evaluateValue(jsExpr('feature.name'), model, { feature: firstName })
    ).toBe('firstName');
    expect(
      evaluateValue(jsExpr("eClass.getName()"), model, { eClass: person })
    ).toBe('Person');
  });

  it('is fail-open: undefined bei Fehler/unbekannter Sprache/fehlender Expression', () => {
    expect(evaluateValue(undefined, model)).toBeUndefined();
    expect(evaluateValue(jsExpr('this.does.not.exist()'), model)).toBeUndefined();
    const aql = UimodelFactory.eINSTANCE.createExpression();
    aql.language = 'AQL';
    aql.body = '1';
    expect(evaluateValue(aql, model)).toBeUndefined();
  });
});

describe('resolveBindings', () => {
  it('bindet label mit feature-Kontext (Zuordnungstabelle)', () => {
    const w = widgetWithBinding(
      'label',
      "({ firstName: 'Vorname' })[feature.name] ?? feature.name"
    );
    expect(resolveBindings(w, model).values.label).toBe('Vorname');
  });

  it('koerziert boolesche und numerische Parameter', () => {
    const ro = widgetWithBinding('readOnly', 'self.locked === true');
    expect(resolveBindings(ro, model).values.readOnly).toBe(true);
    const ml = widgetWithBinding('maxLength', "'42'");
    expect(resolveBindings(ml, model).values.maxLength).toBe(42);
  });

  it('fail-open: Fehler ⇒ kein Eintrag (statischer Wert gilt)', () => {
    const w = widgetWithBinding('label', 'kaputt(');
    expect('label' in resolveBindings(w, model).values).toBe(false);
  });

  it('feature-Binding: null unterdrückt, Ergebnis überschreibt', () => {
    const suppressed = widgetWithBinding('feature', 'null');
    const r1 = resolveBindings(suppressed, model);
    expect(r1.featureSuppressed).toBe(true);
    expect(r1.feature).toBeUndefined();

    const rebound = widgetWithBinding(
      'feature',
      "self.eClass().getEStructuralFeature('locked')"
    );
    const r2 = resolveBindings(rebound, model);
    expect(r2.featureSuppressed).toBe(false);
    expect(r2.feature?.getName?.()).toBe('locked');
  });
});
