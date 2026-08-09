<script setup lang="ts">
/**
 * @deprecated (Issue #4) — AllFeatures gehört als Platzhalter in
 * FormView.fields; die Expansion übernimmt der FormViewComposer ohne
 * eigenes Markup. Dieser Composer bleibt übergangsweise registriert,
 * damit Modelle mit AllFeatures direkt unter UIModel.components weiter
 * rendern (Top-Level-Variante).
 */
import { computed, inject } from 'vue';
import type { EObject } from '@emfts/core';
import type { AllFeatures } from '../generated/AllFeatures';
import { expandFeatures } from '../allfeatures/expandFeatures';
import { EXPANSION_CONTEXT_KEY } from '../allfeatures/context';
import WidgetComposer from './WidgetComposer.vue';

const props = defineProps<{
  component: AllFeatures;
  model: EObject;
}>();

const context = inject(EXPANSION_CONTEXT_KEY, undefined);

const widgets = computed(() => {
  const eClass = props.model.eClass?.();
  if (!eClass) return [];
  return expandFeatures(eClass, props.component, context?.value);
});
</script>

<template>
  <section class="uimodel-all-features">
    <h3 v-if="component.group" class="uimodel-all-features__title">{{ component.group }}</h3>
    <WidgetComposer
      v-for="widget in widgets"
      :key="widget.name"
      :widget="widget"
      :model="model"
    />
  </section>
</template>
