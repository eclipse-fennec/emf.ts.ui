/**
 * Liste und Unterformular **aus der Expansion** — so wie sie in einer
 * App entstehen: generic-default expandiert AllFeatures, klont die
 * Prototypen und rendert sie über den FormViewComposer. Der direkte
 * Mount eines selbst gebauten Widgets prüft diesen Weg nicht.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import {
  BasicEAttribute,
  BasicEClass,
  BasicEPackage,
  BasicEReference,
  BasicResourceSet,
  EPackageRegistry,
  getEcorePackage,
  registerEcorePackage,
  URI,
  XMIResourceFactory,
  type EList,
  type EObject,
  type XMIResource,
} from '@emfts/core';
import { ComponentRegistry, COMPONENT_REGISTRY_KEY } from '@emfts/vue-registry';
import { UimodelPackage } from '../generated/UimodelPackage';
import { UimodelFactory } from '../generated/UimodelFactory';
import type { UIModel } from '../generated/UIModel';
import type { FormView } from '../generated/FormView';
import { collectExpansionContext } from '../allfeatures/expandFeatures';
import { EXPANSION_CONTEXT_KEY } from '../allfeatures/context';
import { resolveCrossResourceProxies } from '../utils/resolveProxies';
import FormViewComposer from './FormViewComposer.vue';

const TEMPLATE_XMI = readFileSync(
  resolve(__dirname, '../../model/templates/generic-default.uimodel.xmi'),
  'utf-8'
);

let uiModel: UIModel;
let person: EObject;
let pkg: BasicEPackage;

const editor = defineComponent({
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

  const rs = new BasicResourceSet();
  rs.getResourceFactoryRegistry().getExtensionToFactoryMap().set('xmi', new XMIResourceFactory());
  const res = rs.createResource(URI.createURI('/generic-default.uimodel.xmi')) as XMIResource;
  res.loadFromString(TEMPLATE_XMI);
  uiModel = res.getContents().get(0) as UIModel;
  resolveCrossResourceProxies(res);

  const ecore = getEcorePackage();
  pkg = new BasicEPackage();
  pkg.setName('t');
  pkg.setNsURI('http://t-expanded/1.0');

  const address = new BasicEClass();
  address.setName('Address');
  for (const name of ['street', 'city']) {
    const attr = new BasicEAttribute();
    attr.setName(name);
    attr.setEType(ecore.getEString());
    address.getEStructuralFeatures().add(attr);
  }

  const personClass = new BasicEClass();
  personClass.setName('Person');
  const firstName = new BasicEAttribute();
  firstName.setName('firstName');
  firstName.setEType(ecore.getEString());
  personClass.getEStructuralFeatures().add(firstName);
  const skills = new BasicEAttribute();
  skills.setName('skills');
  skills.setEType(ecore.getEString());
  skills.setUpperBound(-1);
  personClass.getEStructuralFeatures().add(skills);
  const addresses = new BasicEReference();
  addresses.setName('addresses');
  addresses.setEType(address);
  addresses.setContainment(true);
  addresses.setUpperBound(-1);
  personClass.getEStructuralFeatures().add(addresses);

  pkg.getEClassifiers().add(address);
  pkg.getEClassifiers().add(personClass);
  person = pkg.getEFactoryInstance()!.create(personClass);
});

function feature(name: string) {
  return person.eClass().getEStructuralFeature(name)!;
}

function skillList(): EList<unknown> {
  return person.eGet(feature('skills')) as EList<unknown>;
}

function addressList(): EList<EObject> {
  return person.eGet(feature('addresses')) as EList<EObject>;
}

beforeEach(() => {
  skillList().clear();
  addressList().clear();
  person.eSet(feature('firstName'), 'Lena');
});

function section(name: string): FormView {
  return uiModel.components.find((c) => c.name === name) as unknown as FormView;
}

/**
 * Gemountet wird über einen Wrapper mit `h()`: Gingen die EMF-Objekte
 * als `props` durch @vue/test-utils, würden sie in reaktive Proxys
 * gehüllt, und die Identitätsvergleiche der AllFeatures-Zuordnung
 * liefen ins Leere — in einer echten App passiert das nicht.
 */
function render(name: string) {
  const registry = new ComponentRegistry();
  registry.registerForDataType('EString', editor);
  const context = { value: collectExpansionContext(uiModel as unknown as EObject) };
  const host = defineComponent({
    setup: () => () => h(FormViewComposer, { component: section(name), model: person }),
  });
  return mount(host, {
    global: {
      provide: {
        [COMPONENT_REGISTRY_KEY]: registry,
        [EXPANSION_CONTEXT_KEY]: context,
      },
    },
  });
}

describe('Liste aus der Expansion (Issue #24)', () => {
  it('ein mehrwertiges Attribut wird zur Liste', () => {
    skillList().add('EMF');
    skillList().add('TypeScript');
    const wrapper = render('attributes');
    expect(wrapper.findAll('.uimodel-list')).toHaveLength(1);
    expect(
      wrapper.findAll('.uimodel-list-item input').map((i) => (i.element as HTMLInputElement).value)
    ).toEqual(['EMF', 'TypeScript']);
  });

  it('Hinzufügen und Entfernen wirken auf das Modell', async () => {
    skillList().add('EMF');
    const wrapper = render('attributes');
    await wrapper.find('.uimodel-list-add').trigger('click');
    expect(skillList()).toHaveLength(2);
    await wrapper.findAll('.uimodel-list-remove')[0].trigger('click');
    expect([...skillList()]).toEqual(['']);
  });

  it('die Ansicht folgt der Änderung', async () => {
    const wrapper = render('attributes');
    expect(wrapper.findAll('.uimodel-list-item')).toHaveLength(0);
    await wrapper.find('.uimodel-list-add').trigger('click');
    expect(wrapper.findAll('.uimodel-list-item')).toHaveLength(1);
  });
});

describe('Unterformular aus der Expansion (Issue #25)', () => {
  it('ein Containment zeigt die Felder des Kindes', () => {
    const child = pkg.getEFactoryInstance()!.create(pkg.getEClassifier('Address') as never);
    child.eSet(child.eClass().getEStructuralFeature('street')!, 'Kahlaische Straße 4');
    addressList().add(child);
    const wrapper = render('containments');
    expect(wrapper.findAll('.uimodel-subform-item')).toHaveLength(1);
    expect(wrapper.findAll('[data-feature="street"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-feature="city"]')).toHaveLength(1);
  });

  it('Hinzufügen legt ein Kind an und zeigt es', async () => {
    const wrapper = render('containments');
    await wrapper.find('.uimodel-subform-add').trigger('click');
    expect(addressList()).toHaveLength(1);
    expect(addressList().get(0).eClass().getName()).toBe('Address');
    expect(wrapper.findAll('[data-feature="street"]')).toHaveLength(1);
  });

  it('die Felder des Kindes gehören dem Kind, nicht der Person', async () => {
    const wrapper = render('containments');
    await wrapper.find('.uimodel-subform-add').trigger('click');
    // firstName der Person taucht im Unterformular nicht auf
    expect(wrapper.findAll('[data-feature="firstName"]')).toHaveLength(0);
  });
});
