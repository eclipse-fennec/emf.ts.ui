/**
 * Validierung auf Formularebene
 * ([Issue #20](https://github.com/eclipse-fennec/emf.ts.ui/issues/20)).
 *
 * `FormView.validations` (feldübergreifend) und `validationMappers` standen
 * im Metamodell, ohne dass der Composer sie las. Das Formular wertet sie
 * jetzt aus, sammelt die Meldungen seiner Felder ein und meldet den
 * Gesamtzustand an den Host, der daran ein Speichern blockieren kann.
 */
import {
  computed,
  inject,
  provide,
  reactive,
  watch,
  type ComputedRef,
  type InjectionKey,
} from 'vue';
import type { EObject } from '@emfts/core';
import type { FormView } from '../generated/FormView';
import type { ValidationMessageMapper } from '../generated/ValidationMessageMapper';
import { MapperExecutionOrder } from '../generated/MapperExecutionOrder';
import { evaluateBoolean } from '../utils/evaluateExpression';
import { trackExpressionTick } from '../utils/reactivity';
import { MESSAGE_KEYS, useTranslate } from '../i18n/translate';
import { applyMappers, type Severity, type ValidationMessage } from './messages';

/** Was ein Feld vom umgebenden Formular bekommt. */
export interface FormValidationCollector {
  /**
   * Wendet Feld- und Form-Mapper in der vom Formular bestimmten
   * Reihenfolge an (`FormView.mapperOrder`).
   */
  mapMessage(
    message: ValidationMessage,
    fieldMappers?: Iterable<ValidationMessageMapper>
  ): ValidationMessage;
  /** Meldet die Meldung eines Feldes; `null` nimmt sie zurück. */
  report(id: string, message: ValidationMessage | null): void;
}

/** Zustand eines Formulars, wie ihn der Host bekommt. */
export interface FormValidationState {
  form: FormView;
  model: EObject;
  valid: boolean;
  /** Formular- und Feldmeldungen, Formularmeldungen zuerst. */
  messages: ValidationMessage[];
  formMessages: ValidationMessage[];
  fieldMessages: ValidationMessage[];
}

/** Der Host stellt diese Funktion bereit und erfährt jede Änderung. */
export type ValidationSink = (state: FormValidationState) => void;

export const FORM_VALIDATION_KEY: InjectionKey<FormValidationCollector> =
  Symbol('uimodel:formValidation');

export const VALIDATION_SINK_KEY: InjectionKey<ValidationSink> =
  Symbol('uimodel:validationSink');

/** Das umgebende Formular, falls das Widget in einem steht. */
export function useValidationCollector(): FormValidationCollector | undefined {
  return inject(FORM_VALIDATION_KEY, undefined);
}

/**
 * Richtet die Validierung eines Formulars ein: wertet seine eigenen
 * Validierungen aus, sammelt die der Felder und meldet den Zustand.
 */
export function useFormValidation(
  form: () => FormView,
  model: () => EObject
): {
  formMessages: ComputedRef<ValidationMessage[]>;
  messages: ComputedRef<ValidationMessage[]>;
  valid: ComputedRef<boolean>;
} {
  const translate = useTranslate();
  const fieldMessages = reactive(new Map<string, ValidationMessage>());

  const translateMessage = (text: string | undefined, owner: EObject) =>
    translate(text, { kind: 'message', owner });

  const collector: FormValidationCollector = {
    mapMessage(message, fieldMappers) {
      const component = form();
      const formMappers = component?.validationMappers;
      const fieldFirst =
        (component?.mapperOrder ?? MapperExecutionOrder.FIELD_THEN_FORM) !==
        MapperExecutionOrder.FORM_THEN_FIELD;
      const first = fieldFirst ? fieldMappers : formMappers;
      const second = fieldFirst ? formMappers : fieldMappers;
      let result = applyMappers(message, first, model(), translateMessage);
      result = applyMappers(result, second, model(), translateMessage);
      return result;
    },
    report(id, message) {
      if (message) fieldMessages.set(id, message);
      else fieldMessages.delete(id);
    },
  };
  provide(FORM_VALIDATION_KEY, collector);

  const formMessages = computed<ValidationMessage[]>(() => {
    trackExpressionTick();
    const component = form();
    const context = model();
    const out: ValidationMessage[] = [];
    for (const validation of component?.validations ?? []) {
      let passes = true;
      try {
        passes = evaluateBoolean(validation, context);
      } catch {
        // fail-open wie überall: eine kaputte Expression blockiert nicht
      }
      if (passes) continue;
      const text =
        translate(validation.defaultMessage || MESSAGE_KEYS.invalid, {
          kind: 'message',
          owner: validation,
        }) ?? '';
      out.push(
        applyMappers(
          {
            message: text,
            severity: (validation.severity as Severity | undefined) ?? 'ERROR',
            source: 'form',
          },
          component?.validationMappers,
          context,
          translateMessage
        )
      );
    }
    return out;
  });

  const messages = computed<ValidationMessage[]>(() => [
    ...formMessages.value,
    ...fieldMessages.values(),
  ]);

  const valid = computed(() =>
    messages.value.every((m) => m.severity === 'INFO' || m.severity === 'WARNING')
  );

  const sink = inject(VALIDATION_SINK_KEY, undefined);
  if (sink) {
    watch(
      messages,
      (current) => {
        sink({
          form: form(),
          model: model(),
          valid: valid.value,
          messages: current,
          formMessages: formMessages.value,
          fieldMessages: [...fieldMessages.values()],
        });
      },
      { immediate: true, deep: true }
    );
  }

  return { formMessages, messages, valid };
}
