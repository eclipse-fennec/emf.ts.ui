/**
 * Komponentenwahl und Props des WidgetComposer:
 * - die Widget-Klasse des UI-Modells wählt den Renderer (Issue #21)
 * - label, readOnly, placeholder und required gehen als Props mit (Issue #22)
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
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
import { ComponentRegistry, COMPONENT_REGISTRY_KEY, Priority } from '@emfts/vue-registry';
import { UimodelPackage } from '../generated/UimodelPackage';
import { UimodelFactory } from '../generated/UimodelFactory';
import type { WidgetComponent } from '../generated/WidgetComponent';
import { registerWidgetClass, widgetClassNames } from '../registry/widgetRegistry';
import WidgetComposer from './WidgetComposer.vue';

let model: EObject;
let registry: ComponentRegistry;

/** Testeditor, der seine Props sichtbar macht. */
function editor(tag: string) {
  return defineComponent({
    name: tag,
    props: {
      eObject: { type: Object, required: false },
      feature: { type: Object, required: false },
      eClass: { type: Object, required: false },
      custom: { type: Object, required: false },
      label: { type: String, required: false },
      readonly: { type: Boolean, required: false },
      placeholder: { type: String, required: false },
      required: { type: Boolean, required: false },
    },
    setup(props) {
      return () =>
        h(
          'div',
          {
            'data-editor': tag,
            'data-label': props.label ?? '',
            'data-readonly': String(props.readonly ?? false),
            'data-placeholder': props.placeholder ?? '',
            'data-widget-class': String(
              (props.custom as { widgetClass?: string } | undefined)?.widgetClass ?? ''
            ),
          },
          tag
        );
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
  pkg.setName('t');
  pkg.setNsURI('http://t-widget/1.0');
  const person = new BasicEClass();
  person.setName('Person');
  const note = new BasicEAttribute();
  note.setName('note');
  note.setEType(ecore.getEString());
  person.getEStructuralFeatures().add(note);
  pkg.getEClassifiers().add(person);
  model = pkg.getEFactoryInstance()!.create(person);
});

beforeEach(() => {
  registry = new ComponentRegistry();
  registry.registerForDataType('EString', editor('string-editor'));
});

function widget(
  create: 'createInputWidget' | 'createTextAreaWidget',
  init: { label?: string; readOnly?: boolean; placeholder?: string } = {}
): WidgetComponent {
  const w = UimodelFactory.eINSTANCE[create]();
  w.name = 'note';
  w.feature = model.eClass().getEStructuralFeature('note')!;
  if (init.label !== undefined) w.label = init.label;
  if (init.readOnly !== undefined) w.readOnly = init.readOnly;
  if (init.placeholder !== undefined) w.placeholder = init.placeholder;
  return w as unknown as WidgetComponent;
}

function render(w: WidgetComponent) {
  return mount(WidgetComposer, {
    props: { widget: w, model },
    global: { provide: { [COMPONENT_REGISTRY_KEY]: registry } },
  });
}

describe('Widget-Klasse wählt den Renderer (Issue #21)', () => {
  it('ohne Widget-Registrierung bleibt es beim Datentyp', () => {
    const html = render(widget('createTextAreaWidget')).html();
    expect(html).toContain('data-editor="string-editor"');
  });

  it('eine Registrierung auf die Widget-Klasse schlägt den Datentyp', () => {
    registerWidgetClass(registry, 'TextAreaWidget', editor('textarea-editor'));
    expect(render(widget('createTextAreaWidget')).html()).toContain(
      'data-editor="textarea-editor"'
    );
    // dieselbe Datentyp-Registrierung, anderes Widget → unverändert
    expect(render(widget('createInputWidget')).html()).toContain('data-editor="string-editor"');
  });

  it('Widget-Klasse plus Datentyp ist spezifischer als die Widget-Klasse allein', () => {
    registerWidgetClass(registry, 'TextAreaWidget', editor('any-type'));
    registerWidgetClass(registry, 'TextAreaWidget', editor('string-only'), {
      dataTypeName: 'EString',
    });
    expect(render(widget('createTextAreaWidget')).html()).toContain('data-editor="string-only"');
  });

  it('eine Feature-Registrierung des Hosts bleibt stärker als die Widget-Wahl', () => {
    registerWidgetClass(registry, 'TextAreaWidget', editor('textarea-editor'));
    registry.registerForFeature(model.eClass(), 'note', editor('note-editor'), {
      priority: Priority.FEATURE,
    });
    expect(render(widget('createTextAreaWidget')).html()).toContain('data-editor="note-editor"');
  });

  it('Obertypen greifen nur mit includeSubclasses', () => {
    registerWidgetClass(registry, 'WidgetComponent', editor('base-editor'));
    expect(render(widget('createTextAreaWidget')).html()).toContain('data-editor="string-editor"');

    registry = new ComponentRegistry();
    registry.registerForDataType('EString', editor('string-editor'));
    registerWidgetClass(registry, 'WidgetComponent', editor('base-editor'), {
      includeSubclasses: true,
    });
    expect(render(widget('createTextAreaWidget')).html()).toContain('data-editor="base-editor"');
  });

  it('die Widget-Klasse steht auch im custom-Kontext', () => {
    expect(render(widget('createTextAreaWidget')).html()).toContain(
      'data-widget-class="TextAreaWidget"'
    );
    expect(widgetClassNames(widget('createTextAreaWidget'))).toContain('WidgetComponent');
  });
});

describe('Validierungen des Widgets (Issue #22)', () => {
  function withValidation(w: WidgetComponent, body: string, message: string) {
    const v = UimodelFactory.eINSTANCE.createValidationExpression();
    v.language = 'JS';
    v.body = body;
    v.defaultMessage = message;
    w.validations.push(v);
    return w;
  }

  it('der Composer gibt die Meldung aus, wenn der Editor sie nicht nimmt', () => {
    const w = withValidation(widget('createInputWidget'), 'false', 'Pflichtfeld');
    const html = render(w).html();
    expect(html).toContain('uimodel-widget-message');
    expect(html).toContain('Pflichtfeld');
    expect(html).toContain('uim-s-invalid');
  });

  it('erfüllte Validierung erzeugt keine Meldung', () => {
    const w = withValidation(widget('createInputWidget'), 'true', 'Pflichtfeld');
    const html = render(w).html();
    expect(html).not.toContain('uimodel-widget-message');
    expect(html).not.toContain('uim-s-invalid');
  });

  it('ein Editor mit validationMessage-Prop zeigt sie selbst', () => {
    const own = defineComponent({
      name: 'own-validation',
      props: {
        eObject: { type: Object, required: false },
        feature: { type: Object, required: false },
        custom: { type: Object, required: false },
        invalid: { type: Boolean, required: false },
        validationMessage: { type: String, required: false },
      },
      setup(props) {
        return () => h('div', { 'data-own-message': props.validationMessage ?? '' }, 'own');
      },
    });
    registry = new ComponentRegistry();
    registry.registerForDataType('EString', own);
    const w = withValidation(widget('createInputWidget'), 'false', 'Pflichtfeld');
    const html = render(w).html();
    expect(html).toContain('data-own-message="Pflichtfeld"');
    expect(html).not.toContain('uimodel-widget-message');
  });
});

describe('Widget-Konfiguration als Props (Issue #22)', () => {
  it('label und readOnly des Modells gehen an den Editor', () => {
    const html = render(
      widget('createInputWidget', { label: 'Notiz', readOnly: true, placeholder: 'frei' })
    ).html();
    expect(html).toContain('data-label="Notiz"');
    expect(html).toContain('data-readonly="true"');
    expect(html).toContain('data-placeholder="frei"');
  });

  it('ohne Angabe im Modell bleibt die Prop ungesetzt', () => {
    const html = render(widget('createInputWidget')).html();
    expect(html).toContain('data-label=""');
    expect(html).toContain('data-readonly="false"');
  });

  it('ein Label-Binding gewinnt gegen den statischen Wert', () => {
    const w = widget('createInputWidget', { label: 'statisch' });
    const binding = UimodelFactory.eINSTANCE.createPropertyBinding();
    binding.property = 'label';
    const expr = UimodelFactory.eINSTANCE.createExpression();
    expr.language = 'JS';
    expr.body = "'aus dem Binding'";
    binding.expression = expr;
    w.bindings.push(binding);
    expect(render(w).html()).toContain('data-label="aus dem Binding"');
  });
});
