<script setup lang="ts">
/**
 * Rendert eine fields-Liste: löst strukturelle Platzhalter (AllFeatures,
 * Conditional, ForEach) über resolveStructure auf und rendert Widgets
 * via WidgetComposer; GroupWidgets über den GroupComposer (Label,
 * Sichtbarkeit, Bindings — Issue #10).
 */
import { computed, inject } from 'vue';
import type { EObject } from '@emfts/core';
import type { WidgetComponent } from '../generated/WidgetComponent';
import { resolveStructure } from '../allfeatures/resolveStructure';
import { EXPANSION_CONTEXT_KEY } from '../allfeatures/context';
import { trackExpressionTick } from '../utils/reactivity';
import { STYLE_SHEETS_KEY } from '../css/useStyleSheets';
import WidgetComposer from './WidgetComposer.vue';
import GroupComposer from './GroupComposer.vue';

const props = defineProps<{
  fields: readonly WidgetComponent[] | undefined;
  model: EObject;
}>();

const expansionContext = inject(EXPANSION_CONTEXT_KEY, undefined);
const styleSheets = inject(STYLE_SHEETS_KEY, undefined);

const entries = computed(() => {
  trackExpressionTick();
  void styleSheets?.version.value;
  return resolveStructure(props.fields, props.model, expansionContext?.value);
});

</script>

<template>
  <template v-for="(entry, i) in entries" :key="i">
    <p v-if="entry.kind === 'note'" class="uimodel-foreach-empty">{{ entry.text }}</p>
    <GroupComposer
      v-else-if="entry.kind === 'group'"
      :widget="entry.widget"
      :model="entry.model"
    />
    <WidgetComposer
      v-else
      :widget="entry.widget"
      :model="entry.model"
    />
  </template>
</template>
