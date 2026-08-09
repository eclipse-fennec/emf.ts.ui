import { beforeAll, describe, expect, it } from 'vitest';
import {
  BasicEAttribute,
  BasicEClass,
  BasicEPackage,
  BasicEReference,
  getEcorePackage,
  registerEcorePackage,
  type EClass,
  type EStructuralFeature,
} from '@emfts/core';
import { UimodelPackage } from '../generated/UimodelPackage';
import { UimodelFactory } from '../generated/UimodelFactory';
import type { AllFeatures } from '../generated/AllFeatures';
import type { InputWidget } from '../generated/InputWidget';
import {
  assignFeatures,
  candidateFeatures,
  cloneComponent,
  collectExpansionContext,
  deriveLabel,
  expandFeatures,
  widgetPrototypeFor,
  type ExpansionContext,
} from './expandFeatures';

// ── Test-Metamodell (Person mit Attribut-/Referenz-/Derived-Mix) ──────
let person: EClass;
let f: Record<string, EStructuralFeature>;

function makeAttr(name: string, type: () => unknown, opts: { derived?: boolean; id?: boolean } = {}) {
  const attr = new BasicEAttribute();
  attr.setName(name);
  attr.setEType(type() as never);
  if (opts.derived) attr.setDerived(true);
  if (opts.id) attr.setID(true);
  return attr;
}

beforeAll(() => {
  registerEcorePackage();
  const uimodel = UimodelPackage.eINSTANCE;
  uimodel.setEFactoryInstance(UimodelFactory.eINSTANCE);

  const ecore = getEcorePackage();
  const pkg = new BasicEPackage();
  pkg.setName('t');
  pkg.setNsURI('http://t/1.0');

  const address = new BasicEClass();
  address.setName('Address');
  pkg.getEClassifiers().add(address);

  person = new BasicEClass();
  person.setName('Person');
  const id = makeAttr('id', () => ecore.getEString(), { id: true });
  const firstName = makeAttr('firstName', () => ecore.getEString());
  const age = makeAttr('age', () => ecore.getEInt());
  const active = makeAttr('active', () => ecore.getEBoolean());
  const birthday = makeAttr('birthday', () => ecore.getEDate());
  const fullName = makeAttr('fullName', () => ecore.getEString(), { derived: true });
  const addressRef = new BasicEReference();
  addressRef.setName('address');
  addressRef.setEType(address);
  for (const feat of [id, firstName, age, active, birthday, fullName, addressRef]) {
    person.getEStructuralFeatures().add(feat);
  }
  pkg.getEClassifiers().add(person);
  f = Object.fromEntries(
    person.getEAllStructuralFeatures().map((feat) => [feat.getName(), feat])
  );
});

function block(init: Partial<{ name: string; group: string; priority: number; filterJs: string; withF: EStructuralFeature[]; eTypes: unknown[] }>): AllFeatures {
  const factory = UimodelFactory.eINSTANCE;
  const b = factory.createAllFeatures();
  b.name = init.name ?? 'block';
  if (init.group) b.group = init.group;
  if (init.priority !== undefined) b.priority = init.priority;
  if (init.withF) b.with = init.withF;
  if (init.eTypes) b.eType = init.eTypes as never;
  if (init.filterJs) {
    const expr = factory.createExpression();
    expr.language = 'JS';
    expr.body = init.filterJs;
    b.filter = expr;
  }
  return b;
}

/** Case an einen Block hängen (whenJs weglassen = Default-Fall). */
function addCase(b: AllFeatures, widget: import('../generated/WidgetComponent').WidgetComponent, whenJs?: string) {
  const factory = UimodelFactory.eINSTANCE;
  const templateCase = factory.createTemplateCase();
  templateCase.widget = widget;
  if (whenJs) {
    const expr = factory.createExpression();
    expr.language = 'JS';
    expr.body = whenJs;
    templateCase.when = expr;
  }
  b.cases = [...(b.cases ?? []), templateCase];
  return b;
}

/** Block mit Default-Case (InputWidget-Prototyp) für Tests, die nur
 *  irgendein Widget brauchen. */
function blockWithDefault(init: Parameters<typeof block>[0]): AllFeatures {
  return addCase(block(init), UimodelFactory.eINSTANCE.createInputWidget());
}

describe('deriveLabel', () => {
  it('spaces camelCase and capitalizes', () => {
    expect(deriveLabel('firstName')).toBe('First Name');
    expect(deriveLabel('zip_code')).toBe('Zip code');
    expect(deriveLabel('age')).toBe('Age');
  });
});

describe('widgetPrototypeFor (TemplateCase-Fallliste, Issue #5)', () => {
  function typedCaseBlock(): AllFeatures {
    const factory = UimodelFactory.eINSTANCE;
    const b = block({ name: 'cases', filterJs: 'true' });
    addCase(b, factory.createCheckboxWidget(), "self.eType?.name === 'EBoolean'");
    addCase(b, factory.createNumberWidget(), "['EInt','ELong','EFloat','EDouble'].includes(self.eType?.name)");
    addCase(b, factory.createDateWidget(), "self.eType?.name === 'EDate'");
    addCase(b, factory.createReferenceLinkWidget(), "self.eClass().getName() === 'EReference'");
    addCase(b, factory.createInputWidget()); // Default-Fall
    return b;
  }

  it('erster treffender Case gewinnt; Default-Fall greift zuletzt', () => {
    const b = typedCaseBlock();
    expect(widgetPrototypeFor(b, f.active)!.eClass().getName()).toBe('CheckboxWidget');
    expect(widgetPrototypeFor(b, f.age)!.eClass().getName()).toBe('NumberWidget');
    expect(widgetPrototypeFor(b, f.birthday)!.eClass().getName()).toBe('DateWidget');
    expect(widgetPrototypeFor(b, f.address)!.eClass().getName()).toBe('ReferenceLinkWidget');
    expect(widgetPrototypeFor(b, f.firstName)!.eClass().getName()).toBe('InputWidget');
  });

  it('when ist fail-closed: Fehler/undefined ⇒ Case wird übersprungen', () => {
    const factory = UimodelFactory.eINSTANCE;
    const b = block({ name: 'broken', filterJs: 'true' });
    addCase(b, factory.createCheckboxWidget(), 'kaputt(');
    addCase(b, factory.createInputWidget());
    expect(widgetPrototypeFor(b, f.firstName)!.eClass().getName()).toBe('InputWidget');
  });

  it('cases gewinnen vor der template-Kurzform', () => {
    const factory = UimodelFactory.eINSTANCE;
    const b = block({ name: 'mixed', filterJs: 'true' });
    b.template = factory.createTextAreaWidget();
    addCase(b, factory.createCheckboxWidget(), "self.eType?.name === 'EBoolean'");
    expect(widgetPrototypeFor(b, f.active)!.eClass().getName()).toBe('CheckboxWidget');
    // kein Case trifft → Kurzform-Default
    expect(widgetPrototypeFor(b, f.firstName)!.eClass().getName()).toBe('TextAreaWidget');
  });

  it('kein Treffer und kein template ⇒ Feature wird übersprungen (kein Code-Default)', () => {
    const factory = UimodelFactory.eINSTANCE;
    const b = block({ name: 'no-match', filterJs: "self.name === 'firstName'" });
    addCase(b, factory.createCheckboxWidget(), "self.eType?.name === 'EBoolean'");
    expect(widgetPrototypeFor(b, f.firstName)).toBeUndefined();
    expect(expandFeatures(person, b)).toEqual([]);
  });

  it('expandFeatures nutzt die Fallliste pro Feature (Reihenfolge der Klasse)', () => {
    const b = typedCaseBlock();
    const widgets = expandFeatures(person, b);
    expect(widgets.map((w) => `${w.name}:${w.eClass().getName()}`)).toEqual([
      'id:InputWidget',
      'firstName:InputWidget',
      'age:NumberWidget',
      'active:CheckboxWidget',
      'birthday:DateWidget',
      'fullName:InputWidget',
      'address:ReferenceLinkWidget',
    ]);
  });
});

describe('candidateFeatures', () => {
  it('JS-Metafilter: Attribute ohne derived (is/get-Getter-Konvention)', () => {
    const b = block({
      filterJs: "self.eClass().getName() === 'EAttribute' && !self.derived",
    });
    const names = candidateFeatures(person, b).map((x) => x.getName());
    expect(names).toEqual(['id', 'firstName', 'age', 'active', 'birthday']);
  });

  it('JS-Metafilter: iD-Attribut und derived', () => {
    expect(candidateFeatures(person, block({ filterJs: 'self.iD === true' })).map((x) => x.getName()))
      .toEqual(['id']);
    expect(candidateFeatures(person, block({ filterJs: 'self.derived' })).map((x) => x.getName()))
      .toEqual(['fullName']);
    expect(candidateFeatures(person, block({ filterJs: "self.name === 'age'" })).map((x) => x.getName()))
      .toEqual(['age']);
  });

  it('with: exakte Auswahl in with-Reihenfolge, klassenfremde matchen leer', () => {
    const foreign = new BasicEAttribute();
    foreign.setName('foreign');
    const b = block({ withF: [f.age, foreign, f.firstName] });
    expect(candidateFeatures(person, b).map((x) => x.getName())).toEqual(['age', 'firstName']);
  });

  it('eType-Filter schneidet auf Typen zu', () => {
    const ecore = getEcorePackage();
    const b = block({ eTypes: [ecore.getEString()] });
    expect(candidateFeatures(person, b).map((x) => x.getName()))
      .toEqual(['id', 'firstName', 'fullName']);
  });
});

describe('assignFeatures', () => {
  it('priority > Spezifität > Dokument-Reihenfolge, Dedup pro Kontext', () => {
    const all = block({ name: 'all', filterJs: 'true' });
    const explicitAge = block({ name: 'explicit', withF: [f.age] });
    const highPrio = block({ name: 'prio', priority: 10, filterJs: "self.name === 'age' || self.name === 'firstName'" });
    const ctx: ExpansionContext = { blocks: [all, explicitAge, highPrio], boundFeatures: new Set() };
    const assigned = assignFeatures(person, ctx);
    // priority 10 gewinnt age (trotz with-Spezifität von explicitAge) und firstName
    expect(assigned.get(highPrio)!.map((x) => x.getName())).toEqual(['firstName', 'age']);
    expect(assigned.get(explicitAge)!).toEqual([]);
    // Rest beim Catch-all, jedes Feature genau einmal
    expect(assigned.get(all)!.map((x) => x.getName()))
      .toEqual(['id', 'active', 'birthday', 'fullName', 'address']);
  });

  it('Spezifität: with gewinnt gegen Filter bei gleicher priority', () => {
    const filtered = block({ name: 'filtered', filterJs: 'true' });
    const explicitAge = block({ name: 'explicit', withF: [f.age] });
    const ctx: ExpansionContext = { blocks: [filtered, explicitAge], boundFeatures: new Set() };
    const assigned = assignFeatures(person, ctx);
    expect(assigned.get(explicitAge)!.map((x) => x.getName())).toEqual(['age']);
    expect(assigned.get(filtered)!.map((x) => x.getName())).not.toContain('age');
  });

  it('explizit gebundene Widgets sind ausgenommen', () => {
    const all = block({ name: 'all', filterJs: 'true' });
    const ctx: ExpansionContext = { blocks: [all], boundFeatures: new Set([f.firstName]) };
    expect(assignFeatures(person, ctx).get(all)!.map((x) => x.getName())).not.toContain('firstName');
  });
});

describe('expandFeatures', () => {
  it('bindet Features, leitet Namen/Labels ab, übernimmt group', () => {
    const b = blockWithDefault({ name: 'attrs', group: 'Attributes', filterJs: "self.name === 'firstName'" });
    const widgets = expandFeatures(person, b);
    expect(widgets).toHaveLength(1);
    expect(widgets[0].eClass().getName()).toBe('InputWidget');
    expect(widgets[0].feature).toBe(f.firstName);
    expect(widgets[0].name).toBe('firstName');
    expect(widgets[0].label).toBe('First Name');
    expect(widgets[0].group).toBe('Attributes');
  });

  it('klont den Prototyp inkl. Konfiguration und Referenzen', () => {
    const factory = UimodelFactory.eINSTANCE;
    const proto = factory.createInputWidget();
    proto.name = 'multiline-proto';
    proto.maxLength = 500;
    const style = factory.createWidgetStyle();
    style.name = 'proto-style';
    proto.styles = [style];

    const b = block({ name: 'described', filterJs: "self.name === 'firstName' || self.name === 'id'" });
    b.template = proto;
    const widgets = expandFeatures(person, b) as InputWidget[];
    expect(widgets).toHaveLength(2);
    for (const w of widgets) {
      expect(w).not.toBe(proto);
      expect(Number(w.maxLength)).toBe(500);
      expect(w.styles[0]).toBe(style); // Referenz, kein Klon
      expect(w.feature).toBeDefined();
    }
    expect(widgets.map((w) => w.name)).toEqual(['id', 'firstName']);
    // Prototyp selbst bleibt ungebunden
    expect(proto.feature).toBeUndefined();
  });
});

describe('required aus lowerBound (Issue #3/#7)', () => {
  it('leitet required ab und generiert die Required-Validation', () => {
    const ecore = getEcorePackage();
    const mandatory = new BasicEAttribute();
    mandatory.setName('code');
    mandatory.setEType(ecore.getEString());
    mandatory.setLowerBound(1);
    const cls = new BasicEClass();
    cls.setName('Thing');
    cls.getEStructuralFeatures().add(mandatory);

    const b = blockWithDefault({ name: 'attrs', filterJs: 'true' });
    const [widget] = expandFeatures(cls, b);
    expect(widget.required).toBe(true);
    expect(widget.validations).toHaveLength(1);
    expect(widget.validations[0].defaultMessage).toBe('Code ist erforderlich.');
    expect(widget.validations[0].body).toContain('self.code');
  });

  it('explizites required=false am Block gewinnt, keine Validation', () => {
    const ecore = getEcorePackage();
    const mandatory = new BasicEAttribute();
    mandatory.setName('code');
    mandatory.setEType(ecore.getEString());
    mandatory.setLowerBound(1);
    const cls = new BasicEClass();
    cls.setName('Thing');
    cls.getEStructuralFeatures().add(mandatory);

    const b = blockWithDefault({ name: 'attrs', filterJs: 'true' });
    b.required = false;
    const [widget] = expandFeatures(cls, b);
    expect(widget.required).toBe(false);
    expect(widget.validations ?? []).toHaveLength(0);
  });
});

describe('Block-Level-Bindings', () => {
  function labelBinding(body: string) {
    const factory = UimodelFactory.eINSTANCE;
    const binding = factory.createPropertyBinding();
    binding.property = 'label';
    const expr = factory.createExpression();
    expr.language = 'JS';
    expr.body = body;
    binding.expression = expr;
    return binding;
  }

  it('kopiert Block-Bindings auf case-erzeugte Widgets', () => {
    const factory = UimodelFactory.eINSTANCE;
    const b = block({ name: 'attrs', filterJs: "self.name === 'active' || self.name === 'firstName'" });
    addCase(b, factory.createCheckboxWidget(), "self.eType?.name === 'EBoolean'");
    addCase(b, factory.createInputWidget());
    b.bindings = [labelBinding('feature.name.toUpperCase()')];
    const widgets = expandFeatures(person, b);
    // Fallliste wählt pro Feature den Widget-Typ
    expect(widgets.map((w) => w.eClass().getName())).toEqual(['InputWidget', 'CheckboxWidget']);
    for (const w of widgets) {
      expect(w.bindings).toHaveLength(1);
      expect(w.bindings[0]).not.toBe(b.bindings[0]); // Klon, nicht geteilt
      expect(w.bindings[0].expression?.body).toBe('feature.name.toUpperCase()');
    }
  });

  it('template-eigene Bindings gewinnen bei gleichem property', () => {
    const factory = UimodelFactory.eINSTANCE;
    const proto = factory.createInputWidget();
    proto.name = 'proto';
    proto.bindings = [labelBinding("'vom Template'")];
    const b = block({ name: 'attrs', filterJs: "self.name === 'firstName'" });
    b.template = proto;
    b.bindings = [labelBinding("'vom Block'"), (() => {
      const other = factory.createPropertyBinding();
      other.property = 'placeholder';
      const expr = factory.createExpression();
      expr.language = 'JS';
      expr.body = "'aus Block'";
      other.expression = expr;
      return other;
    })()];
    const [widget] = expandFeatures(person, b);
    const byProp = Object.fromEntries(widget.bindings.map((x) => [x.property, x.expression?.body]));
    expect(byProp.label).toBe("'vom Template'");
    expect(byProp.placeholder).toBe("'aus Block'");
  });
});

describe('collectExpansionContext', () => {
  it('sammelt Blöcke und gebundene Features aus einem UIModel', () => {
    const factory = UimodelFactory.eINSTANCE;
    const uiModel = factory.createUIModel();
    uiModel.name = 'm';
    const form = factory.createFormView();
    form.name = 'form';
    const bound = factory.createInputWidget();
    bound.name = 'firstName';
    bound.feature = f.firstName;
    form.fields = [bound];
    const b = blockWithDefault({ name: 'rest', filterJs: 'true' });
    uiModel.components = [form, b];

    const ctx = collectExpansionContext(uiModel as never);
    expect(ctx.blocks).toEqual([b]);
    expect(ctx.boundFeatures.has(f.firstName)).toBe(true);

    // Ende-zu-Ende: firstName nicht doppelt
    const names = expandFeatures(person, b, ctx).map((w) => w.name);
    expect(names).not.toContain('firstName');
    expect(names).toContain('age');
  });
});
