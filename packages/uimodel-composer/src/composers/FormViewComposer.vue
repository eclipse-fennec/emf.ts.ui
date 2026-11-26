<script setup lang="ts">
/**
 * Rendert eine FormView. Strukturelle Platzhalter in fields —
 * AllFeatures (Issue #4), Conditional/ForEach/GroupWidget (Issue #6) —
 * löst der FieldsRenderer auf; Layout/Überschriften gehören der
 * FormView bzw. dem Konsumenten.
 *
 * Die feldübergreifenden `validations` und die `validationMappers` des
 * Formulars wertet `useFormValidation` aus (Issue #20): Meldungen stehen
 * über den Feldern, die Meldungen der Felder laufen hier zusammen, und
 * ein Host, der `VALIDATION_SINK_KEY` bereitstellt, erfährt den Zustand.
 */
import type { EObject } from '@emfts/core';
import type { FormView } from '../generated/FormView';
import FieldsRenderer from './FieldsRenderer.vue';
import { useFormValidation } from '../validation/useFormValidation';

const props = defineProps<{
  component: FormView;
  model: EObject;
}>();

const { formMessages, messages, valid } = useFormValidation(
  () => props.component,
  () => props.model
);

defineExpose({ messages, valid });
</script>

<template>
  <div class="uimodel-form-view" :class="{ 'uim-s-invalid': !valid }">
    <ul v-if="formMessages.length" class="uimodel-form-messages" role="alert">
      <li
        v-for="(message, index) in formMessages"
        :key="index"
        :class="`uimodel-severity-${message.severity.toLowerCase()}`"
      >
        {{ message.message }}
      </li>
    </ul>
    <FieldsRenderer :fields="component.fields" :model="model" />
  </div>
</template>
