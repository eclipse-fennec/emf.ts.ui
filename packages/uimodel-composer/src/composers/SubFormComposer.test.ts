/**
 * Unterformular für Containment-Referenzen (Issue #25): das enthaltene
 * Objekt wird im selben Formular bearbeitet, bei [0..*] mit Hinzufügen,
 * Entfernen und Umsortieren — und rekursive Modelle enden bei maxDepth.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import {
  BasicEAttribute,
  BasicEClass,
  BasicEPackage,
  BasicEReference,
  EPackageRegistry,
  getEcorePackage,
  registerEcorePackage,
  type EList,
  type EObject,
} from '@emfts/core';
import { ComponentRegistry, COMPONENT_REGISTRY_KEY } from '@emfts/vue-registry';
import { UimodelPackage } from '../generated/UimodelPackage';
import { UimodelFactory } from '../generated/UimodelFactory';
import type { SubFormWidget } from '../generated/SubFormWidget';
import SubFormComposer from './SubFormComposer.vue';

let pkg: BasicEPackage;
let order: EObject;
let person: EObject;

const stringEditor = defineComponent({
  props: { eObject: Object, feature: Object, custom: Object, label: String },
  setup: (props) => () =>
    h('input', {
      'data-feature': (props.feature as { getName?: () => string } | undefined)?.getName?.() ?? '',
    }),
});

beforeAll(() => {
  registerEcorePackage();
  const uimodel = UimodelPackage.eINSTANCE;
  uimodel.setEFactoryInstance(UimodelFactory.eINSTANCE);
  EPackageRegistry.INSTANCE.set(uimodel.getNsURI()!, uimodel);

  const ecore = getEcorePackage();
  pkg = new BasicEPackage();
  pkg.setName('t');
  pkg.setNsURI('http://t-subform/1.0');

  // Address [0..1] und Item [0..*] unter Order
  const address = new BasicEClass();
  address.setName('Address');
  const street = new BasicEAttribute();
  street.setName('street');
  street.setEType(ecore.getEString());
  address.getEStructuralFeatures().add(street);

  const item = new BasicEClass();
  item.setName('Item');
  const title = new BasicEAttribute();
  title.setName('title');
  title.setEType(ecore.getEString());
  item.getEStructuralFeatures().add(title);

  const orderClass = new BasicEClass();
  orderClass.setName('Order');
  const addressRef = new BasicEReference();
  addressRef.setName('address');
  addressRef.setEType(address);
  addressRef.setContainment(true);
  orderClass.getEStructuralFeatures().add(addressRef);
  const itemsRef = new BasicEReference();
  itemsRef.setName('items');
  itemsRef.setEType(item);
  itemsRef.setContainment(true);
  itemsRef.setUpperBound(-1);
  orderClass.getEStructuralFeatures().add(itemsRef);

  // zyklisch: zwei Personen, die aufeinander zeigen
  const personClass = new BasicEClass();
  personClass.setName('Person');
  const personName = new BasicEAttribute();
  personName.setName('name');
  personName.setEType(ecore.getEString());
  personClass.getEStructuralFeatures().add(personName);
  const partnerRef = new BasicEReference();
  partnerRef.setName('partner');
  partnerRef.setEType(personClass);
  personClass.getEStructuralFeatures().add(partnerRef);

  for (const classifier of [address, item, orderClass, personClass]) {
    pkg.getEClassifiers().add(classifier);
  }
  order = pkg.getEFactoryInstance()!.create(orderClass);

  const anna = pkg.getEFactoryInstance()!.create(personClass);
  const bert = pkg.getEFactoryInstance()!.create(personClass);
  anna.eSet(partnerRef, bert);
  bert.eSet(partnerRef, anna);
  person = anna;
});

beforeEach(() => {
  order.eSet(order.eClass().getEStructuralFeature('address')!, null);
  (order.eGet(order.eClass().getEStructuralFeature('items')!) as EList<EObject>).clear();
});

/** AllFeatures-Platzhalter mit Default-Fall — die Widget-Wahl steht im Modell. */
function allAttributes() {
  const all = UimodelFactory.eINSTANCE.createAllFeatures();
  all.name = 'child';
  const filter = UimodelFactory.eINSTANCE.createExpression();
  filter.language = 'JS';
  filter.body = "self.eClass().getName() === 'EAttribute'";
  all.filter = filter;
  const fallback = UimodelFactory.eINSTANCE.createTemplateCase();
  fallback.widget = UimodelFactory.eINSTANCE.createInputWidget();
  all.cases.push(fallback);
  return all;
}

function widget(
  object: EObject,
  featureName: string,
  init: Partial<Record<string, unknown>> = {}
): SubFormWidget {
  const w = UimodelFactory.eINSTANCE.createSubFormWidget();
  w.name = featureName;
  w.feature = object.eClass().getEStructuralFeature(featureName)!;
  for (const [key, value] of Object.entries(init)) {
    (w as unknown as Record<string, unknown>)[key] = value;
  }
  w.fields.push(allAttributes() as never);
  return w;
}

function render(w: SubFormWidget, object: EObject) {
  const registry = new ComponentRegistry();
  registry.registerForDataType('EString', stringEditor);
  return mount(SubFormComposer, {
    props: { widget: w, model: object },
    global: { provide: { [COMPONENT_REGISTRY_KEY]: registry } },
  });
}

describe('einwertiges Containment', () => {
  it('ohne Kind erscheint nur die Schaltfläche zum Anlegen', () => {
    const wrapper = render(widget(order, 'address', { emptyText: 'Keine Adresse' }), order);
    expect(wrapper.text()).toContain('Keine Adresse');
    expect(wrapper.find('.uimodel-subform-add').exists()).toBe(true);
    expect(wrapper.find('input').exists()).toBe(false);
  });

  it('Anlegen erzeugt das Kind und zeigt seine Felder', async () => {
    const wrapper = render(widget(order, 'address'), order);
    await wrapper.find('.uimodel-subform-add').trigger('click');
    const child = order.eGet(order.eClass().getEStructuralFeature('address')!) as EObject;
    expect(child).toBeTruthy();
    expect(child.eClass().getName()).toBe('Address');
    expect(wrapper.find('[data-feature="street"]').exists()).toBe(true);
  });

  it('ein vorhandenes Kind wird sofort gezeigt', () => {
    const address = pkg.getEFactoryInstance()!.create(pkg.getEClassifier('Address') as never);
    order.eSet(order.eClass().getEStructuralFeature('address')!, address);
    const wrapper = render(widget(order, 'address'), order);
    expect(wrapper.find('[data-feature="street"]').exists()).toBe(true);
  });

  it('Entfernen setzt die Referenz zurück', async () => {
    const address = pkg.getEFactoryInstance()!.create(pkg.getEClassifier('Address') as never);
    order.eSet(order.eClass().getEStructuralFeature('address')!, address);
    const wrapper = render(widget(order, 'address'), order);
    await wrapper.find('.uimodel-subform-remove').trigger('click');
    expect(order.eGet(order.eClass().getEStructuralFeature('address')!)).toBeFalsy();
  });
});

describe('mehrwertiges Containment', () => {
  function items(): EList<EObject> {
    return order.eGet(order.eClass().getEStructuralFeature('items')!) as EList<EObject>;
  }

  it('legt Kinder an und zeigt je Kind ein Unterformular', async () => {
    const wrapper = render(widget(order, 'items'), order);
    await wrapper.find('.uimodel-subform-add').trigger('click');
    await wrapper.find('.uimodel-subform-add').trigger('click');
    expect(items()).toHaveLength(2);
    expect(wrapper.findAll('.uimodel-subform-item')).toHaveLength(2);
    expect(wrapper.findAll('[data-feature="title"]')).toHaveLength(2);
  });

  it('entfernt genau das gewählte Kind', async () => {
    const first = pkg.getEFactoryInstance()!.create(pkg.getEClassifier('Item') as never);
    const second = pkg.getEFactoryInstance()!.create(pkg.getEClassifier('Item') as never);
    items().add(first);
    items().add(second);
    const wrapper = render(widget(order, 'items'), order);
    await wrapper.findAll('.uimodel-subform-remove')[0].trigger('click');
    expect([...items()]).toEqual([second]);
  });

  it('sortiert Kinder um', async () => {
    const first = pkg.getEFactoryInstance()!.create(pkg.getEClassifier('Item') as never);
    const second = pkg.getEFactoryInstance()!.create(pkg.getEClassifier('Item') as never);
    items().add(first);
    items().add(second);
    const wrapper = render(widget(order, 'items'), order);
    await wrapper.findAll('.uimodel-subform-down')[0].trigger('click');
    expect([...items()]).toEqual([second, first]);
  });

  it('readOnly nimmt jede Bedienung', () => {
    items().add(pkg.getEFactoryInstance()!.create(pkg.getEClassifier('Item') as never));
    const wrapper = render(widget(order, 'items', { readOnly: true }), order);
    expect(wrapper.find('.uimodel-subform-add').exists()).toBe(false);
    expect(wrapper.find('.uimodel-subform-remove').exists()).toBe(false);
    expect(wrapper.find('.uimodel-subform-up').exists()).toBe(false);
  });
});

describe('Rekursion', () => {
  /**
   * Ein Unterformular, dessen Fallliste wieder auf dasselbe Widget zeigt
   * — so sieht ein rekursives UI-Modell aus: Containment klont den
   * Prototyp, die Referenz im TemplateCase bleibt. Ohne Begrenzung
   * liefe das an einem zyklischen Modell endlos.
   */
  function recursivePartnerWidget(maxDepth: number): SubFormWidget {
    const w = UimodelFactory.eINSTANCE.createSubFormWidget();
    w.name = 'partner';
    w.feature = person.eClass().getEStructuralFeature('partner')!;
    w.maxDepth = maxDepth;
    w.fields.push(allAttributes() as never);

    const again = UimodelFactory.eINSTANCE.createAllFeatures();
    again.name = 'partner-again';
    const filter = UimodelFactory.eINSTANCE.createExpression();
    filter.language = 'JS';
    filter.body = "self.name === 'partner'";
    again.filter = filter;
    const onlyCase = UimodelFactory.eINSTANCE.createTemplateCase();
    onlyCase.widget = w as never;
    again.cases.push(onlyCase);
    w.fields.push(again as never);
    return w;
  }

  it('bricht bei maxDepth ab, statt endlos zu rendern', () => {
    const wrapper = render(recursivePartnerWidget(2), person);
    expect(wrapper.text()).toContain('Weitere Schachtelung ausgelassen');
    // Wurzel plus genau maxDepth Ebenen
    expect(wrapper.findAll('.uimodel-subform')).toHaveLength(3);
  });

  it('eine größere Tiefe rendert mehr Ebenen', () => {
    const wrapper = render(recursivePartnerWidget(4), person);
    expect(wrapper.findAll('.uimodel-subform')).toHaveLength(5);
  });
});
