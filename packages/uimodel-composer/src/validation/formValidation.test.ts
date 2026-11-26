/**
 * Validierung auf Formularebene (Issue #20): feldübergreifende
 * Validierungen, Mapper-Kaskade und der Zustand, den ein Host bekommt.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
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
import { ComponentRegistry, COMPONENT_REGISTRY_KEY } from '@emfts/vue-registry';
import { UimodelPackage } from '../generated/UimodelPackage';
import { UimodelFactory } from '../generated/UimodelFactory';
import type { FormView } from '../generated/FormView';
import type { ValidationMessageMapper } from '../generated/ValidationMessageMapper';
import FormViewComposer from '../composers/FormViewComposer.vue';
import { VALIDATION_SINK_KEY, type FormValidationState } from './useFormValidation';
import { applyMappers, type ValidationMessage } from './messages';

let model: EObject;

const factory = () => UimodelFactory.eINSTANCE;

beforeAll(() => {
  registerEcorePackage();
  const uimodel = UimodelPackage.eINSTANCE;
  uimodel.setEFactoryInstance(UimodelFactory.eINSTANCE);
  EPackageRegistry.INSTANCE.set(uimodel.getNsURI()!, uimodel);

  const ecore = getEcorePackage();
  const pkg = new BasicEPackage();
  pkg.setName('t');
  pkg.setNsURI('http://t-form/1.0');
  const period = new BasicEClass();
  period.setName('Period');
  for (const name of ['start', 'end']) {
    const attr = new BasicEAttribute();
    attr.setName(name);
    attr.setEType(ecore.getEInt());
    period.getEStructuralFeatures().add(attr);
  }
  pkg.getEClassifiers().add(period);
  model = pkg.getEFactoryInstance()!.create(period);
  model.eSet(period.getEStructuralFeature('start')!, 10);
  model.eSet(period.getEStructuralFeature('end')!, 5);
});

/** Formular mit einer feldübergreifenden Validierung. */
function form(init: { body: string; message?: string; severity?: string } = { body: 'false' }): FormView {
  const f = factory().createFormView();
  f.name = 'period';
  const validation = factory().createValidationExpression();
  validation.language = 'JS';
  validation.body = init.body;
  if (init.message) validation.defaultMessage = init.message;
  if (init.severity) validation.severity = init.severity as never;
  f.validations.push(validation);
  return f;
}

function mapper(init: Partial<Record<string, unknown>>): ValidationMessageMapper {
  const m = factory().createValidationMessageMapper();
  for (const [key, value] of Object.entries(init)) {
    (m as unknown as Record<string, unknown>)[key] = value;
  }
  return m;
}

function render(f: FormView, sink?: (state: FormValidationState) => void) {
  const registry = new ComponentRegistry();
  registry.registerForDataType(
    'EInt',
    defineComponent({
      props: { eObject: Object, feature: Object, custom: Object },
      setup: () => () => h('div', 'int'),
    })
  );
  return mount(FormViewComposer, {
    props: { component: f, model },
    global: {
      provide: {
        [COMPONENT_REGISTRY_KEY]: registry,
        ...(sink ? { [VALIDATION_SINK_KEY]: sink } : {}),
      },
    },
  });
}

describe('FormView.validations', () => {
  it('die verletzte Validierung erscheint über den Feldern', () => {
    const html = render(
      form({ body: 'self.end > self.start', message: 'Ende muss nach dem Start liegen' })
    ).html();
    expect(html).toContain('uimodel-form-messages');
    expect(html).toContain('Ende muss nach dem Start liegen');
    expect(html).toContain('uim-s-invalid');
  });

  it('die erfüllte Validierung erzeugt keine Meldung', () => {
    const html = render(form({ body: 'self.start > self.end', message: 'egal' })).html();
    expect(html).not.toContain('uimodel-form-messages');
    expect(html).not.toContain('uim-s-invalid');
  });

  it('ohne defaultMessage greift der eingebaute Text', () => {
    expect(render(form({ body: 'false' })).html()).toContain('Ungültiger Wert');
  });

  it('eine kaputte Expression blockiert nicht', () => {
    expect(render(form({ body: 'self.nope.nope' })).html()).not.toContain(
      'uimodel-form-messages'
    );
  });
});

describe('Zustand für den Host', () => {
  it('der Sink bekommt Meldungen und Gültigkeit', async () => {
    const seen: FormValidationState[] = [];
    render(form({ body: 'false', message: 'Fehler' }), (state) => seen.push(state));
    await nextTick();
    expect(seen.length).toBeGreaterThan(0);
    const last = seen[seen.length - 1];
    expect(last.valid).toBe(false);
    expect(last.formMessages.map((m) => m.message)).toEqual(['Fehler']);
  });

  it('eine Warnung macht das Formular nicht ungültig', async () => {
    const seen: FormValidationState[] = [];
    render(form({ body: 'false', message: 'Nur ein Hinweis', severity: 'WARNING' }), (state) =>
      seen.push(state)
    );
    await nextTick();
    const last = seen[seen.length - 1];
    expect(last.messages).toHaveLength(1);
    expect(last.valid).toBe(true);
  });
});

describe('Meldungen der Felder laufen im Formular zusammen', () => {
  /** Formular ohne eigene Validierung, mit einem ungültigen Feld. */
  function formWithField(fieldBody: string, message: string): FormView {
    const f = factory().createFormView();
    f.name = 'period';
    const widget = factory().createInputWidget();
    widget.name = 'end';
    widget.feature = model.eClass().getEStructuralFeature('end')!;
    const validation = factory().createValidationExpression();
    validation.language = 'JS';
    validation.body = fieldBody;
    validation.defaultMessage = message;
    widget.validations.push(validation);
    f.fields.push(widget);
    return f;
  }

  it('ein ungültiges Feld macht das Formular ungültig', async () => {
    const seen: FormValidationState[] = [];
    render(formWithField('self.end > 100', 'Ende zu klein'), (state) => seen.push(state));
    await nextTick();
    const last = seen[seen.length - 1];
    expect(last.fieldMessages).toHaveLength(1);
    expect(last.fieldMessages[0].message).toBe('Ende zu klein');
    expect(last.fieldMessages[0].featureName).toBe('end');
    expect(last.valid).toBe(false);
  });

  it('ein gültiges Feld meldet nichts', async () => {
    const seen: FormValidationState[] = [];
    render(formWithField('self.end > 1', 'Ende zu klein'), (state) => seen.push(state));
    await nextTick();
    const last = seen[seen.length - 1];
    expect(last.fieldMessages).toHaveLength(0);
    expect(last.valid).toBe(true);
  });

  it('die Mapper des Formulars greifen auch auf Feldmeldungen', async () => {
    const f = formWithField('false', 'Roh');
    f.validationMappers.push(mapper({ mappedText: 'Vom Formular ersetzt' }));
    const seen: FormValidationState[] = [];
    render(f, (state) => seen.push(state));
    await nextTick();
    expect(seen[seen.length - 1].fieldMessages[0].message).toBe('Vom Formular ersetzt');
  });
});

describe('ValidationMessageMapper', () => {
  const base: ValidationMessage = { message: 'Original', severity: 'ERROR', source: 'form' };

  it('ersetzt Text und Schwere', () => {
    const result = applyMappers(base, [mapper({ mappedText: 'Ersetzt', mappedSeverity: 'WARNING' })], model);
    expect(result.message).toBe('Ersetzt');
    expect(result.severity).toBe('WARNING');
  });

  it('überschreibt nur, was gesetzt ist', () => {
    const result = applyMappers(base, [mapper({ mappedText: 'Nur Text' })], model);
    expect(result.message).toBe('Nur Text');
    expect(result.severity).toBe('ERROR');
  });

  it('matchCode grenzt ein', () => {
    const mappers = [mapper({ matchCode: 'E42', mappedText: 'Getroffen' })];
    expect(applyMappers(base, mappers, model).message).toBe('Original');
    expect(applyMappers({ ...base, code: 'E42' }, mappers, model).message).toBe('Getroffen');
  });

  it('matchSeverity zählt nur, wenn gesetzt', () => {
    const matching = mapper({ matchSeverity: 'ERROR', mappedText: 'Fehlertext' });
    expect(applyMappers(base, [matching], model).message).toBe('Fehlertext');
    const other = mapper({ matchSeverity: 'INFO', mappedText: 'Infotext' });
    expect(applyMappers(base, [other], model).message).toBe('Original');
  });

  it('matchExpression sieht die Meldung und das Objekt', () => {
    const expr = factory().createExpression();
    expr.language = 'JS';
    expr.body = "message.message === 'Original' && self.start === 10";
    const result = applyMappers(base, [mapper({ matchExpression: expr, mappedText: 'Beides' })], model);
    expect(result.message).toBe('Beides');
  });

  it('mappedTextExpression baut den Text aus der Meldung', () => {
    const expr = factory().createExpression();
    expr.language = 'JS';
    expr.body = "'[' + message.severity + '] ' + message.message";
    const result = applyMappers(base, [mapper({ mappedTextExpression: expr })], model);
    expect(result.message).toBe('[ERROR] Original');
  });

  it('kaskadiert in der Reihenfolge von order', () => {
    const mappers = [
      mapper({ order: 2, mappedText: 'zweiter' }),
      mapper({ order: 1, mappedText: 'erster' }),
    ];
    expect(applyMappers(base, mappers, model).message).toBe('zweiter');
  });

  it('greift auch auf Formularmeldungen im Composer', () => {
    const f = form({ body: 'false', message: 'Roh' });
    f.validationMappers.push(mapper({ mappedText: 'Durch den Mapper' }));
    expect(render(f).html()).toContain('Durch den Mapper');
  });
});
