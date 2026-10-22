/**
 * Übersetzbare Texte (Issue #13): LocalizedEString-Werte laufen zur
 * Renderzeit durch den Übersetzer des Konsumenten; das Modell behält
 * den Key, ein fehlender Key bleibt sichtbar.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { computed, defineComponent, h, nextTick, ref, type ComputedRef } from 'vue';
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
import GroupComposer from '../composers/GroupComposer.vue';
import FieldsRenderer from '../composers/FieldsRenderer.vue';
import { useValidation } from '../composables/useValidation';
import {
  isLocalized,
  MESSAGE_KEYS,
  translateText,
  TRANSLATOR_KEY,
  type TranslateContext,
  type Translator,
} from './translate';

const factory = UimodelFactory.eINSTANCE;
let model: EObject;

const DE: Record<string, string> = {
  'form.contact': 'Kontakt',
  'form.empty': 'Keine Einträge',
  [MESSAGE_KEYS.required]: '{label} wird benötigt.',
};
const EN: Record<string, string> = {
  'form.contact': 'Contact',
  'form.empty': 'No entries',
};

function dictionary(dict: Record<string, string>): Translator {
  return (key, ctx) => dict[key]?.replace('{label}', ctx.params?.label ?? '');
}

function jsExpr(body: string) {
  const expr = factory.createExpression();
  expr.language = 'JS';
  expr.body = body;
  return expr;
}

beforeAll(() => {
  registerEcorePackage();
  const uimodel = UimodelPackage.eINSTANCE;
  uimodel.setEFactoryInstance(factory);
  EPackageRegistry.INSTANCE.set(uimodel.getNsURI()!, uimodel);

  const pkg = new BasicEPackage();
  pkg.setName('d');
  pkg.setNsURI('http://test/i18n/1.0');
  const person = new BasicEClass();
  person.setName('Person');
  const firstName = new BasicEAttribute();
  firstName.setName('firstName');
  firstName.setEType(getEcorePackage().getEString());
  person.getEStructuralFeatures().add(firstName);
  pkg.getEClassifiers().add(person);
  model = pkg.getEFactoryInstance().create(person);
});

describe('translateText', () => {
  const ctx: TranslateContext = { kind: 'label' };

  it('nimmt die Übersetzung, wenn der Übersetzer den Key kennt', () => {
    expect(translateText(dictionary(DE), 'form.contact', ctx)).toBe('Kontakt');
  });

  it('zeigt einen fehlenden Key unverändert — er bleibt sichtbar', () => {
    expect(translateText(dictionary(DE), 'textPlain:Form.fontSize', ctx)).toBe('textPlain:Form.fontSize');
  });

  it('lässt wörtliche Texte ohne Übersetzer stehen', () => {
    expect(translateText(undefined, 'Vorname', ctx)).toBe('Vorname');
  });

  it('hat eingebaute Texte für Composer-Keys, mit und ohne Label', () => {
    const message: TranslateContext = { kind: 'message', params: { label: 'Code' } };
    expect(translateText(undefined, MESSAGE_KEYS.required, message)).toBe('Code ist erforderlich.');
    expect(translateText(undefined, MESSAGE_KEYS.required, { kind: 'message' })).toBe('Dieses Feld ist erforderlich.');
    expect(translateText(undefined, MESSAGE_KEYS.invalid, { kind: 'message' })).toBe('Ungültiger Wert.');
    expect(translateText(dictionary(DE), MESSAGE_KEYS.required, message)).toBe('Code wird benötigt.');
  });
});

describe('isLocalized', () => {
  it('erkennt die LocalizedEString-Attribute des UIModels', () => {
    const widgetComponent = UimodelPackage.Literals.WIDGET_COMPONENT;
    expect(isLocalized(widgetComponent.getEStructuralFeature('label'))).toBe(true);
    expect(isLocalized(widgetComponent.getEStructuralFeature('placeholder'))).toBe(true);
    expect(isLocalized(widgetComponent.getEStructuralFeature('name'))).toBe(false);
  });
});

describe('Composer', () => {
  function contactGroup() {
    const g = factory.createGroupWidget();
    g.name = 'contact';
    g.label = 'form.contact';
    return g;
  }

  function renderGroup(g = contactGroup(), translate?: Translator | ComputedRef<Translator>) {
    const translator = typeof translate === 'function' ? computed(() => translate) : translate;
    return mount(GroupComposer, {
      props: { widget: g, model },
      global: {
        stubs: { WidgetComposer: true, FieldsRenderer: true },
        provide: translator ? { [TRANSLATOR_KEY as symbol]: translator } : {},
      },
    });
  }

  it('übersetzt das Gruppen-Label und lässt den Key im Modell', () => {
    const g = contactGroup();
    const wrapper = renderGroup(g, dictionary(DE));
    expect(wrapper.find('.uim-group-label').text()).toBe('Kontakt');
    expect(g.label).toBe('form.contact');
  });

  it('zeigt ohne Übersetzer den Wert selbst', () => {
    expect(renderGroup().find('.uim-group-label').text()).toBe('form.contact');
  });

  it('rendert bei einem Sprachwechsel neu', async () => {
    const locale = ref<'de' | 'en'>('de');
    const translator = computed<Translator>(() => dictionary(locale.value === 'de' ? DE : EN));
    const wrapper = renderGroup(contactGroup(), translator);
    expect(wrapper.find('.uim-group-label').text()).toBe('Kontakt');
    locale.value = 'en';
    await nextTick();
    expect(wrapper.find('.uim-group-label').text()).toBe('Contact');
  });

  it('übersetzt Binding-Ergebnisse nicht — sie sind berechnet', () => {
    const g = contactGroup();
    const binding = factory.createPropertyBinding();
    binding.property = 'label';
    binding.expression = jsExpr("'form.contact'");
    g.bindings.push(binding);
    expect(renderGroup(g, dictionary(DE)).find('.uim-group-label').text()).toBe('form.contact');
  });

  it('übersetzt emptyText eines leeren ForEach', () => {
    const each = factory.createForEach();
    each.items = jsExpr('[]');
    each.emptyText = 'form.empty';
    const wrapper = mount(FieldsRenderer, {
      props: { fields: [each], model },
      global: {
        stubs: { WidgetComposer: true, GroupComposer: true },
        provide: { [TRANSLATOR_KEY as symbol]: computed(() => dictionary(EN)) },
      },
    });
    expect(wrapper.find('.uimodel-foreach-empty').text()).toBe('No entries');
  });
});

describe('useValidation', () => {
  function messageOf(defaultMessage: string | undefined, translate?: Translator, label?: string) {
    const validation = factory.createValidationExpression();
    validation.language = 'JS';
    validation.body = 'false';
    if (defaultMessage !== undefined) validation.defaultMessage = defaultMessage;
    let message: string | undefined;
    mount(
      defineComponent({
        setup() {
          const result = useValidation([validation], model, { label });
          return () => h('span', (message = result.value?.message));
        },
      }),
      { global: { provide: translate ? { [TRANSLATOR_KEY as symbol]: computed(() => translate) } : {} } }
    );
    return message;
  }

  it('übersetzt die Pflichtfeld-Meldung mit dem Label', () => {
    expect(messageOf(MESSAGE_KEYS.required, dictionary(DE), 'Vorname')).toBe('Vorname wird benötigt.');
    expect(messageOf(MESSAGE_KEYS.required, undefined, 'Vorname')).toBe('Vorname ist erforderlich.');
  });

  it('übersetzt eine modellierte defaultMessage und fällt ohne auf den eingebauten Text zurück', () => {
    expect(messageOf('form.contact', dictionary(EN))).toBe('Contact');
    expect(messageOf(undefined)).toBe('Ungültiger Wert.');
  });
});
