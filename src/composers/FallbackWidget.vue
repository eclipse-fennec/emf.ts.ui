<script setup lang="ts">
/**
 * Definierter Fallback (Issue #9), wenn die vue-registry für ein Feature
 * keine Komponente liefert — typischerweise bei Widget-Klassen aus
 * Extension-Paketen, deren Renderer der Host (noch) nicht registriert hat.
 *
 * Degradiert wie ein TextAreaWidget zu Plaintext: der Wert des gebundenen
 * Features bleibt les- und editierbar, es gehen keine Daten verloren.
 * Der Host überschreibt das jederzeit, indem er einen Renderer registriert.
 */
import { computed, ref, watch } from 'vue';
import type { EObject, EStructuralFeature } from '@emfts/core';
import type { ResolvedStyle } from '../types/ResolvedStyle';
import type { WidgetComponent } from '../generated/WidgetComponent';

const props = defineProps<{
  eObject: EObject;
  feature: EStructuralFeature;
  custom?: {
    resolvedStyle?: ResolvedStyle;
    rawWidget?: WidgetComponent;
  };
}>();

const resolved = computed(() => props.custom?.resolvedStyle ?? {});
const label = computed(
  () => resolved.value.label ?? props.feature?.getName?.() ?? ''
);
const placeholder = computed(() => resolved.value.placeholder ?? '');
const readOnly = computed(() => isTrue(resolved.value.readOnly));
const required = computed(() => isTrue(resolved.value.required));
const rows = computed(() => {
  const raw = (props.custom?.rawWidget as unknown as { rows?: unknown })?.rows;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 3;
});

function isTrue(value: unknown): boolean {
  return value === true || value === 'true';
}

const currentValue = computed(() => {
  const value = props.eObject?.eGet(props.feature);
  return value === undefined || value === null ? '' : String(value);
});

const localValue = ref(currentValue.value);
watch(currentValue, (v) => {
  localValue.value = v;
});

function onInput(event: Event): void {
  const value = (event.target as HTMLTextAreaElement).value;
  localValue.value = value;
  props.eObject?.eSet(props.feature, value);
}
</script>

<template>
  <div class="uimodel-fallback-widget">
    <label class="uimodel-fallback-widget__label">
      {{ label }}<span v-if="required" aria-hidden="true"> *</span>
    </label>
    <textarea
      class="uimodel-fallback-widget__input"
      :rows="rows"
      :value="localValue"
      :placeholder="placeholder"
      :readonly="readOnly"
      :disabled="readOnly"
      @input="onInput"
    ></textarea>
  </div>
</template>

<style scoped>
/* Bewusst minimal — Styling gehört dem Konsumenten bzw. dem CSS-Modell. */
.uimodel-fallback-widget {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.uimodel-fallback-widget__input {
  font-family: inherit;
  font-size: inherit;
}
</style>
