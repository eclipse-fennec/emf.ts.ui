<script setup lang="ts">
/**
 * Generic string field widget.
 * Registered in the ComponentRegistry for EString attributes.
 * Receives MatchContext props; reads UIModelContext.custom for label/style.
 */
import { computed, ref, watch } from 'vue';
import type { EObject, EStructuralFeature } from '@emfts/core';
import { useValidation } from '@emfts/uimodel-composer';
import type { ResolvedStyle, ValidationExpression } from '@emfts/uimodel-composer';

const props = defineProps<{
  eObject?: EObject;
  feature?: EStructuralFeature;
  custom?: {
    resolvedStyle?: ResolvedStyle;
    rawWidget?: {
      label?: string;
      placeholder?: string;
      readOnly?: boolean;
      required?: boolean;
      validations?: ValidationExpression[];
    };
  };
}>();

const validationResult = useValidation(
  () => props.custom?.rawWidget?.validations ?? [],
  () => props.eObject!
);

// resolvedStyle enthält die Binding-aufgelösten Werte
// (Binding > statisch > Style-Kette); rawWidget nur als Fallback.
const resolved   = computed(() => props.custom?.resolvedStyle ?? {});
const label      = computed(() => resolved.value.label ?? props.custom?.rawWidget?.label ?? props.feature?.getName?.() ?? '');
const placeholder = computed(() => resolved.value.placeholder ?? props.custom?.rawWidget?.placeholder ?? '');
const readOnly   = computed(() => toBool(resolved.value.readOnly ?? props.custom?.rawWidget?.readOnly));
const required   = computed(() => toBool(resolved.value.required ?? props.custom?.rawWidget?.required));
const cssClass   = computed(() => resolved.value.css ?? '');

function toBool(v: unknown): boolean {
  return v === true || v === 'true';
}

// Read the current value from the domain object
const currentValue = computed(() =>
  props.eObject && props.feature
    ? (props.eObject.eGet(props.feature) as string | undefined) ?? ''
    : ''
);

const localValue = ref(currentValue.value);
watch(currentValue, (v) => { localValue.value = v; });

function onInput(e: Event) {
  const val = (e.target as HTMLInputElement).value;
  localValue.value = val;
  if (props.eObject && props.feature) {
    props.eObject.eSet(props.feature, val);
  }
}
</script>

<template>
  <div class="field" :class="[cssClass, { 'field--required': required, 'field--readonly': readOnly }]">
    <label class="field__label">
      {{ label }}<span v-if="required" class="field__required" aria-hidden="true"> *</span>
    </label>
    <input
      class="field__input"
      type="text"
      :value="localValue"
      :placeholder="placeholder"
      :readonly="readOnly"
      :disabled="readOnly"
      :class="{ 'field__input--invalid': validationResult }"
      @input="onInput"
    />
    <span v-if="validationResult" class="field__error">{{ validationResult.message }}</span>
  </div>
</template>
