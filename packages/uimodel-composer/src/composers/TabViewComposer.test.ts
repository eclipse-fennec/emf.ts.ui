/**
 * Reiterleiste der TabView (Issue #23): nur der aktive Reiter ist
 * sichtbar, Klick und Pfeiltasten wechseln, ARIA stimmt.
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
import type { TabView } from '../generated/TabView';
import TabViewComposer from './TabViewComposer.vue';

let model: EObject;

beforeAll(() => {
  registerEcorePackage();
  const uimodel = UimodelPackage.eINSTANCE;
  uimodel.setEFactoryInstance(UimodelFactory.eINSTANCE);
  EPackageRegistry.INSTANCE.set(uimodel.getNsURI()!, uimodel);

  const ecore = getEcorePackage();
  const pkg = new BasicEPackage();
  pkg.setName('t');
  pkg.setNsURI('http://t-tab/1.0');
  const person = new BasicEClass();
  person.setName('Person');
  const attr = new BasicEAttribute();
  attr.setName('firstName');
  attr.setEType(ecore.getEString());
  person.getEStructuralFeatures().add(attr);
  pkg.getEClassifiers().add(person);
  model = pkg.getEFactoryInstance()!.create(person);
});

/** TabView mit zwei Reitern; der zweite trägt eine eigene Überschrift. */
function tabView(): TabView {
  const factory = UimodelFactory.eINSTANCE;
  const view = factory.createTabView();
  view.name = 'person';
  const general = factory.createFormView();
  general.name = 'general';
  const advanced = factory.createFormView();
  advanced.name = 'advanced';
  advanced.group = 'Erweitert';
  view.tabs.push(general, advanced);
  return view;
}

function render(view: TabView, props: Record<string, unknown> = {}) {
  return mount(TabViewComposer, {
    props: { component: view, model, ...props },
    global: { stubs: { ComponentDispatcher: true } },
  });
}

describe('TabViewComposer', () => {
  it('rendert eine Reiterleiste mit einem Reiter je Tab', () => {
    const wrapper = render(tabView());
    expect(wrapper.find('[role="tablist"]').exists()).toBe(true);
    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs).toHaveLength(2);
    expect(tabs[0].text()).toBe('general');
    // group ist im Modell die Überschrift und schlägt den Namen
    expect(tabs[1].text()).toBe('Erweitert');
  });

  it('zeigt anfangs nur den ersten Reiter', () => {
    const wrapper = render(tabView());
    const panels = wrapper.findAll('[role="tabpanel"]');
    expect(panels).toHaveLength(2);
    expect(panels[0].isVisible()).toBe(true);
    expect(panels[1].isVisible()).toBe(false);
    expect(wrapper.findAll('[role="tab"]')[0].attributes('aria-selected')).toBe('true');
  });

  it('ein Klick wechselt den Reiter', async () => {
    const wrapper = render(tabView());
    await wrapper.findAll('[role="tab"]')[1].trigger('click');
    const panels = wrapper.findAll('[role="tabpanel"]');
    expect(panels[0].isVisible()).toBe(false);
    expect(panels[1].isVisible()).toBe(true);
    expect(wrapper.emitted('update:activeTab')?.[0]).toEqual(['advanced']);
  });

  it('Pfeiltasten wechseln und laufen um', async () => {
    const wrapper = render(tabView());
    const bar = wrapper.find('[role="tablist"]');
    await bar.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.findAll('[role="tabpanel"]')[1].isVisible()).toBe(true);
    await bar.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.findAll('[role="tabpanel"]')[0].isVisible()).toBe(true);
    await bar.trigger('keydown', { key: 'End' });
    expect(wrapper.findAll('[role="tabpanel"]')[1].isVisible()).toBe(true);
    await bar.trigger('keydown', { key: 'Home' });
    expect(wrapper.findAll('[role="tabpanel"]')[0].isVisible()).toBe(true);
  });

  it('nur der aktive Reiter ist fokussierbar', async () => {
    const wrapper = render(tabView());
    const tabs = () => wrapper.findAll('[role="tab"]');
    expect(tabs().map((t) => t.attributes('tabindex'))).toEqual(['0', '-1']);
    await tabs()[1].trigger('click');
    expect(tabs().map((t) => t.attributes('tabindex'))).toEqual(['-1', '0']);
  });

  it('der aktive Reiter lässt sich von außen setzen', () => {
    const wrapper = render(tabView(), { activeTab: 'advanced' });
    expect(wrapper.findAll('[role="tabpanel"]')[1].isVisible()).toBe(true);
  });

  it('ein unbekannter Name fällt auf den ersten Reiter zurück', () => {
    const wrapper = render(tabView(), { activeTab: 'gibtesnicht' });
    expect(wrapper.findAll('[role="tabpanel"]')[0].isVisible()).toBe(true);
  });

  it('Panel und Reiter sind über ARIA verbunden', () => {
    const wrapper = render(tabView());
    const tab = wrapper.findAll('[role="tab"]')[0];
    const panel = wrapper.findAll('[role="tabpanel"]')[0];
    expect(tab.attributes('aria-controls')).toBe(panel.attributes('id'));
    expect(panel.attributes('aria-labelledby')).toBe(tab.attributes('id'));
  });
});
