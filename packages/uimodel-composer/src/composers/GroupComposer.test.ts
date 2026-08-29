/**
 * Rendering-Verhalten des GroupComposer (Issue #10):
 * Label wird ausgegeben, wenn modelliert — inklusive PropertyBinding —,
 * und die visibilityCondition der Gruppe greift.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import {
  BasicEAttribute,
  BasicEClass,
  BasicEPackage,
  EPackageRegistry,
  getEcorePackage,
  registerEcorePackage,
  type EObject,
} from '@emfts/core';
import { UimodelPackage } from '../generated/UimodelPackage';
import { UimodelFactory } from '../generated/UimodelFactory';
import type { GroupWidget } from '../generated/GroupWidget';
import GroupComposer from './GroupComposer.vue';

let model: EObject;

function jsExpr(body: string) {
  const expr = UimodelFactory.eINSTANCE.createExpression();
  expr.language = 'JS';
  expr.body = body;
  return expr;
}

/** Gruppe mit einem Kind-Widget, das an ein vorhandenes Feature gebunden ist. */
function group(init: { label?: string; visibleJs?: string; labelBindingJs?: string } = {}): GroupWidget {
  const factory = UimodelFactory.eINSTANCE;
  const g = factory.createGroupWidget();
  g.name = 'contact';
  if (init.label !== undefined) g.label = init.label;
  if (init.visibleJs) g.visibilityCondition = jsExpr(init.visibleJs);
  if (init.labelBindingJs) {
    const binding = factory.createPropertyBinding();
    binding.property = 'label';
    binding.expression = jsExpr(init.labelBindingJs);
    g.bindings = [binding];
  }
  const child = factory.createInputWidget();
  child.name = 'firstName';
  child.feature = model.eClass().getEStructuralFeature('firstName')!;
  g.fields = [child];
  return g;
}

function render(g: GroupWidget) {
  return mount(GroupComposer, {
    props: { widget: g, model },
    global: {
      // WidgetComposer braucht die vue-registry; die Kinder sind für
      // diese Tests irrelevant und werden gestubbt.
      stubs: { WidgetComposer: true, FieldsRenderer: true },
    },
  });
}

beforeAll(() => {
  registerEcorePackage();
  const uimodel = UimodelPackage.eINSTANCE;
  uimodel.setEFactoryInstance(UimodelFactory.eINSTANCE);
  EPackageRegistry.INSTANCE.set(uimodel.getNsURI()!, uimodel);

  const ecore = getEcorePackage();
  const pkg = new BasicEPackage();
  pkg.setName('d');
  pkg.setNsURI('http://test/group/1.0');
  const person = new BasicEClass();
  person.setName('Person');
  for (const [name, type] of [['firstName', ecore.getEString()], ['locked', ecore.getEBoolean()]] as const) {
    const attr = new BasicEAttribute();
    attr.setName(name);
    attr.setEType(type);
    person.getEStructuralFeatures().add(attr);
  }
  pkg.getEClassifiers().add(person);
  model = pkg.getEFactoryInstance()!.create(person);
  model.eSet(person.getEStructuralFeature('firstName')!, 'Lena');
});

describe('GroupComposer', () => {
  it('rendert das modellierte label als eigenes Element', () => {
    const wrapper = render(group({ label: 'Kontakt' }));
    const heading = wrapper.find('.uim-group-label');
    expect(heading.exists()).toBe(true);
    expect(heading.text()).toBe('Kontakt');
  });

  it('ohne label bleibt das DOM unverändert (kein leeres Heading)', () => {
    const wrapper = render(group());
    expect(wrapper.find('.uim-group-label').exists()).toBe(false);
    // Container samt Klassen und data-Attributen bleibt erhalten
    expect(wrapper.find('.uimodel-group').exists()).toBe(true);
    expect(wrapper.attributes('data-uim-name')).toBe('contact');
  });

  it('layout landet als Modifier-Klasse am Container', () => {
    const g = group({ label: 'Kontakt' });
    g.layout = 'HORIZONTAL' as never;
    expect(render(g).find('.uimodel-group--horizontal').exists()).toBe(true);
  });

  it('label kann per PropertyBinding kommen (Issue #3)', () => {
    const wrapper = render(group({ labelBindingJs: "'Kontakt von ' + self.firstName" }));
    expect(wrapper.find('.uim-group-label').text()).toBe('Kontakt von Lena');
  });

  it('visibilityCondition der Gruppe wird ausgewertet', () => {
    expect(render(group({ label: 'A', visibleJs: 'false' })).find('.uimodel-group').exists()).toBe(false);
    expect(render(group({ label: 'A', visibleJs: 'true' })).find('.uimodel-group').exists()).toBe(true);
  });
});
