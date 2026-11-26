/**
 * Listeneditor für mehrwertige Attribute (Issue #24): Elemente werden an
 * Ort und Stelle bearbeitet, hinzugefügt, entfernt und umsortiert.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import {
  BasicEAttribute,
  BasicEClass,
  BasicEPackage,
  EPackageRegistry,
  getEcorePackage,
  registerEcorePackage,
  type EList,
  type EObject,
} from '@emfts/core';
import { UimodelPackage } from '../generated/UimodelPackage';
import { UimodelFactory } from '../generated/UimodelFactory';
import type { ListWidget } from '../generated/ListWidget';
import ListComposer from './ListComposer.vue';

let model: EObject;
let numbers: EObject;

beforeAll(() => {
  registerEcorePackage();
  const uimodel = UimodelPackage.eINSTANCE;
  uimodel.setEFactoryInstance(UimodelFactory.eINSTANCE);
  EPackageRegistry.INSTANCE.set(uimodel.getNsURI()!, uimodel);

  const ecore = getEcorePackage();
  const pkg = new BasicEPackage();
  pkg.setName('t');
  pkg.setNsURI('http://t-list/1.0');

  const article = new BasicEClass();
  article.setName('Article');
  const tags = new BasicEAttribute();
  tags.setName('tags');
  tags.setEType(ecore.getEString());
  tags.setUpperBound(-1);
  article.getEStructuralFeatures().add(tags);
  pkg.getEClassifiers().add(article);

  const measurement = new BasicEClass();
  measurement.setName('Measurement');
  const values = new BasicEAttribute();
  values.setName('values');
  values.setEType(ecore.getEInt());
  values.setUpperBound(-1);
  measurement.getEStructuralFeatures().add(values);
  pkg.getEClassifiers().add(measurement);

  model = pkg.getEFactoryInstance()!.create(article);
  numbers = pkg.getEFactoryInstance()!.create(measurement);
});

function listOf(object: EObject, featureName: string): EList<unknown> {
  return object.eGet(object.eClass().getEStructuralFeature(featureName)!) as EList<unknown>;
}

beforeEach(() => {
  listOf(model, 'tags').clear();
  listOf(numbers, 'values').clear();
});

function widget(
  object: EObject,
  featureName: string,
  init: Partial<Record<string, unknown>> = {}
): ListWidget {
  const w = UimodelFactory.eINSTANCE.createListWidget();
  w.name = featureName;
  w.feature = object.eClass().getEStructuralFeature(featureName)!;
  for (const [key, value] of Object.entries(init)) {
    (w as unknown as Record<string, unknown>)[key] = value;
  }
  return w;
}

function render(w: ListWidget, object: EObject = model) {
  return mount(ListComposer, { props: { widget: w, model: object } });
}

describe('ListComposer', () => {
  it('rendert ein Eingabefeld je Element', () => {
    const list = listOf(model, 'tags');
    list.add('rot');
    list.add('blau');
    const wrapper = render(widget(model, 'tags'));
    const inputs = wrapper.findAll('input');
    expect(inputs).toHaveLength(2);
    expect((inputs[0].element as HTMLInputElement).value).toBe('rot');
    expect((inputs[1].element as HTMLInputElement).value).toBe('blau');
  });

  it('eine Eingabe ändert die Liste an Ort und Stelle', async () => {
    const list = listOf(model, 'tags');
    list.add('rot');
    const wrapper = render(widget(model, 'tags'));
    await wrapper.find('input').setValue('grün');
    expect([...list]).toEqual(['grün']);
    // dieselbe EList, nicht ersetzt
    expect(listOf(model, 'tags')).toBe(list);
  });

  it('Hinzufügen hängt ein leeres Element an', async () => {
    const list = listOf(model, 'tags');
    const wrapper = render(widget(model, 'tags'));
    await wrapper.find('.uimodel-list-add').trigger('click');
    expect([...list]).toEqual(['']);
  });

  it('Zahlen bekommen ein Zahlenfeld und eine Null als Startwert', async () => {
    const list = listOf(numbers, 'values');
    const wrapper = render(widget(numbers, 'values'), numbers);
    await wrapper.find('.uimodel-list-add').trigger('click');
    expect([...list]).toEqual([0]);
    expect(wrapper.find('input').attributes('type')).toBe('number');
    await wrapper.find('input').setValue('42');
    expect([...list]).toEqual([42]);
  });

  it('Entfernen nimmt genau ein Element heraus', async () => {
    const list = listOf(model, 'tags');
    list.add('rot');
    list.add('blau');
    const wrapper = render(widget(model, 'tags'));
    await wrapper.findAll('.uimodel-list-remove')[0].trigger('click');
    expect([...list]).toEqual(['blau']);
  });

  it('Umsortieren vertauscht die Nachbarn', async () => {
    const list = listOf(model, 'tags');
    list.add('rot');
    list.add('blau');
    const wrapper = render(widget(model, 'tags'));
    await wrapper.findAll('.uimodel-list-down')[0].trigger('click');
    expect([...list]).toEqual(['blau', 'rot']);
    await wrapper.findAll('.uimodel-list-up')[1].trigger('click');
    expect([...list]).toEqual(['rot', 'blau']);
  });

  it('readOnly schaltet Bedienung und Felder ab', () => {
    listOf(model, 'tags').add('rot');
    const wrapper = render(widget(model, 'tags', { readOnly: true }));
    expect(wrapper.find('.uimodel-list-add').exists()).toBe(false);
    expect(wrapper.find('.uimodel-list-remove').exists()).toBe(false);
    expect(wrapper.find('input').attributes('disabled')).toBeDefined();
  });

  it('allowAdd und allowRemove lassen sich einzeln abschalten', () => {
    listOf(model, 'tags').add('rot');
    const wrapper = render(widget(model, 'tags', { allowAdd: false, allowReorder: false }));
    expect(wrapper.find('.uimodel-list-add').exists()).toBe(false);
    expect(wrapper.find('.uimodel-list-up').exists()).toBe(false);
    expect(wrapper.find('.uimodel-list-remove').exists()).toBe(true);
  });

  it('emptyText erscheint nur bei leerer Liste', async () => {
    const wrapper = render(widget(model, 'tags', { emptyText: 'Noch keine Schlagworte' }));
    expect(wrapper.text()).toContain('Noch keine Schlagworte');
    await wrapper.find('.uimodel-list-add').trigger('click');
    expect(wrapper.text()).not.toContain('Noch keine Schlagworte');
  });
});
