/**
 * Widget-Extension-Pakete (Issue #9): eine WidgetComponent-Subklasse aus
 * einem FREMDEN EPackage (Muster gene-widgets/vega/maps: eigenes Package,
 * Superklasse via href, generierte Impl) durchläuft AllFeatures-Expansion,
 * TemplateCase, UIModelOverlay und PropertyBindings.
 *
 * Die Test-Impl bildet generierten Code nach (extends WidgetComponentImpl,
 * eClass()-Override, eGet/eSet für eigene Features) — Extension-Widgets
 * brauchen generierte Impls; DynamicEObjects sind nicht ausreichend.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  BasicEAttribute,
  BasicEClass,
  BasicEFactory,
  BasicEPackage,
  getEcorePackage,
  registerEcorePackage,
  type EClass,
  type EObject,
  type EStructuralFeature,
} from '@emfts/core';
import { UimodelPackage } from '../generated/UimodelPackage';
import { UimodelFactory } from '../generated/UimodelFactory';
import { WidgetComponentImpl } from '../generated/WidgetComponentImpl';
import type { WidgetComponent } from '../generated/WidgetComponent';
import type { AllFeatures } from '../generated/AllFeatures';
import {
  collectOverlayCases,
  expandFeatures,
  type ExpansionContext,
} from './expandFeatures';
import { resolveBindings } from '../utils/resolveBindings';
import { eClassHierarchyNames } from '../css/componentClasses';

// ── Test-Extension-Package (nachgebildeter generierter Code) ──────────
let codeWidgetClass: BasicEClass;
let languageAttr: BasicEAttribute;

interface CodeWidget extends WidgetComponent {
  language?: string;
}

class CodeWidgetImpl extends WidgetComponentImpl implements CodeWidget {
  private _language?: string;

  override eClass(): EClass {
    return codeWidgetClass;
  }

  get language(): string {
    return this._language!;
  }

  set language(value: string) {
    this._language = value;
  }

  override eGet(feature: EStructuralFeature): unknown {
    if (feature === (languageAttr as unknown as EStructuralFeature)) return this._language;
    // geerbte Features über die Accessor-Properties der Basis-Impl
    return (this as unknown as Record<string, unknown>)[feature.getName() ?? ''];
  }

  override eSet(feature: EStructuralFeature, newValue: unknown): void {
    if (feature === (languageAttr as unknown as EStructuralFeature)) {
      this._language = newValue as string;
      return;
    }
    (this as unknown as Record<string, unknown>)[feature.getName() ?? ''] = newValue;
  }
}

class TestWidgetsFactory extends BasicEFactory {
  override create(eClass: EClass): EObject {
    if (eClass === (codeWidgetClass as unknown as EClass)) return new CodeWidgetImpl();
    return super.create(eClass);
  }
}

// ── Domäne ────────────────────────────────────────────────────────────
let person: EClass;
let f: Record<string, EStructuralFeature>;
let model: EObject;

function jsExpr(body: string) {
  const expr = UimodelFactory.eINSTANCE.createExpression();
  expr.language = 'JS';
  expr.body = body;
  return expr;
}

beforeAll(() => {
  registerEcorePackage();
  const uimodel = UimodelPackage.eINSTANCE;
  uimodel.setEFactoryInstance(UimodelFactory.eINSTANCE);
  const ecore = getEcorePackage();

  // Extension-Package: CodeWidget extends uimodel WidgetComponent
  const pkg = new BasicEPackage();
  pkg.setName('testwidgets');
  pkg.setNsURI('http://test/widgets/1.0');
  codeWidgetClass = new BasicEClass();
  codeWidgetClass.setName('CodeWidget');
  codeWidgetClass
    .getESuperTypes()
    .push(uimodel.getEClassifier('WidgetComponent') as EClass);
  languageAttr = new BasicEAttribute();
  languageAttr.setName('language');
  languageAttr.setEType(ecore.getEString());
  codeWidgetClass.getEStructuralFeatures().add(languageAttr);
  pkg.getEClassifiers().add(codeWidgetClass);
  const factory = new TestWidgetsFactory();
  factory.setEPackage(pkg);
  pkg.setEFactoryInstance(factory);

  // Domäne
  const dpkg = new BasicEPackage();
  dpkg.setName('d');
  dpkg.setNsURI('http://test/domain/1.0');
  person = new BasicEClass();
  person.setName('Person');
  const firstName = new BasicEAttribute();
  firstName.setName('firstName');
  firstName.setEType(ecore.getEString());
  const age = new BasicEAttribute();
  age.setName('age');
  age.setEType(ecore.getEInt());
  person.getEStructuralFeatures().add(firstName);
  person.getEStructuralFeatures().add(age);
  dpkg.getEClassifiers().add(person);
  f = Object.fromEntries(person.getEAllStructuralFeatures().map((x) => [x.getName(), x]));
  model = dpkg.getEFactoryInstance()!.create(person);
});

function codeProto(language: string): CodeWidget {
  const proto = new CodeWidgetImpl();
  proto.name = 'code-proto';
  proto.language = language;
  return proto;
}

function caseFor(widget: WidgetComponent, whenJs?: string) {
  const c = UimodelFactory.eINSTANCE.createTemplateCase();
  c.widget = widget;
  if (whenJs) c.when = jsExpr(whenJs);
  return c;
}

describe('Widget-Extension durch die Expansions-Pipeline (Issue #9)', () => {
  it('TemplateCase mit Extension-Prototyp: Klon, Feature-Bindung, eigene Attribute', () => {
    const factory = UimodelFactory.eINSTANCE;
    const block = factory.createAllFeatures();
    block.name = 'attrs';
    block.filter = jsExpr('true');
    const proto = codeProto('json');
    block.cases = [
      caseFor(proto as WidgetComponent, "self.eType?.name === 'EString'"),
      caseFor(factory.createInputWidget()),
    ];

    const widgets = expandFeatures(person, block);
    const byName = Object.fromEntries(widgets.map((w) => [w.name, w]));
    expect(byName.firstName.eClass().getName()).toBe('CodeWidget');
    expect(byName.firstName).not.toBe(proto);
    expect(byName.firstName.feature).toBe(f.firstName);
    expect((byName.firstName as CodeWidget).language).toBe('json');
    expect(byName.firstName.label).toBe('First Name');
    expect(byName.age.eClass().getName()).toBe('InputWidget');
  });

  it('UIModelOverlay-Case mit Extension-Prototyp übersteuert den Block', () => {
    const factory = UimodelFactory.eINSTANCE;
    const block = factory.createAllFeatures();
    block.name = 'attrs';
    block.filter = jsExpr("self.name === 'firstName'");
    block.cases = [caseFor(factory.createInputWidget())];

    const overlay = factory.createUIModelOverlay();
    overlay.name = 'ws';
    overlay.priority = 100;
    const proto = codeProto('ocl');
    overlay.templates = [proto as WidgetComponent];
    overlay.cases = [caseFor(proto as WidgetComponent, "self.eType?.name === 'EString'")];

    const ctx: ExpansionContext = {
      blocks: [block],
      boundFeatures: new Set(),
      overlayCases: collectOverlayCases([overlay]),
    };
    const [widget] = expandFeatures(person, block, ctx);
    expect(widget.eClass().getName()).toBe('CodeWidget');
    expect((widget as CodeWidget).language).toBe('ocl');
  });

  it('PropertyBindings wirken auf Extension-Widgets (eigenes + geerbtes Binding)', () => {
    const factory = UimodelFactory.eINSTANCE;
    const block = factory.createAllFeatures();
    block.name = 'attrs';
    block.filter = jsExpr("self.name === 'firstName'");
    const proto = codeProto('json');
    // Binding auf das Extension-Attribut language am Prototyp
    const langBinding = factory.createPropertyBinding();
    langBinding.property = 'language';
    langBinding.expression = jsExpr("feature.name === 'firstName' ? 'markdown' : 'json'");
    proto.bindings = [langBinding];
    block.cases = [caseFor(proto as WidgetComponent)];
    // geerbtes Block-Binding auf label
    const labelBinding = factory.createPropertyBinding();
    labelBinding.property = 'label';
    labelBinding.expression = jsExpr("'Code: ' + feature.name");
    block.bindings = [labelBinding];

    const [widget] = expandFeatures(person, block);
    expect(widget.bindings.map((b) => b.property).sort()).toEqual(['label', 'language']);
    const resolved = resolveBindings(widget, model);
    expect(resolved.values.language).toBe('markdown');
    expect(resolved.values.label).toBe('Code: firstName');
  });

  it('CSS-Stamping kennt die Extension-Hierarchie', () => {
    // eigene EClass zuerst, danach alle Supertypen (Reihenfolge der
    // Supertypen ist für die Klassen-Stempel unerheblich)
    const names = eClassHierarchyNames(codeWidgetClass as unknown as EClass);
    expect(names[0]).toBe('CodeWidget');
    expect(names).toContain('WidgetComponent');
    expect(names).toContain('Component');
  });
});
