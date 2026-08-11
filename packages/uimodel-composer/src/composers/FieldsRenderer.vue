<script setup lang="ts">
/**
 * Rendert eine fields-Liste: löst strukturelle Platzhalter (AllFeatures,
 * Conditional, ForEach) über resolveStructure auf und rendert Widgets
 * via WidgetComposer; GroupWidgets rekursiv als Container mit
 * uimodel-group-Klassen (Styling beim Konsumenten/CSS-Modell).
 */
import { computed, inject } from 'vue';
import type { EObject } from '@emfts/core';
import type { WidgetComponent } from '../generated/WidgetComponent';
import { resolveStructure } from '../allfeatures/resolveStructure';
import { EXPANSION_CONTEXT_KEY } from '../allfeatures/context';
import { trackExpressionTick } from '../utils/reactivity';
import { componentCssClasses, componentDataAttrs } from '../css/componentClasses';
import { STYLE_SHEETS_KEY } from '../css/useStyleSheets';
import { resolveStyleList } from '../utils/resolveStyleChain';
import WidgetComposer from './WidgetComposer.vue';

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

function groupClasses(widget: WidgetComponent, model: EObject): string[] {
  const layout = String(
    (widget as unknown as { layout?: unknown }).layout ?? 'VERTICAL'
  ).toLowerCase();
  return [
    ...componentCssClasses(widget, {
      model,
      sheets: styleSheets?.sheets.value,
      resolvedCss: resolveStyleList(widget.styles ?? []).css,
    }),
    'uimodel-group',
    `uimodel-group--${layout}`,
  ];
}

function groupFields(widget: WidgetComponent): WidgetComponent[] {
  return (widget as unknown as { fields?: WidgetComponent[] }).fields ?? [];
}

const dataAttrs = componentDataAttrs;
</script>

<template>
  <template v-for="(entry, i) in entries" :key="i">
    <p v-if="entry.kind === 'note'" class="uimodel-foreach-empty">{{ entry.text }}</p>
    <div
      v-else-if="entry.kind === 'group'"
      :class="groupClasses(entry.widget, entry.model)"
      v-bind="dataAttrs(entry.widget)"
    >
      <FieldsRenderer :fields="groupFields(entry.widget)" :model="entry.model" />
    </div>
    <WidgetComposer
      v-else
      :widget="entry.widget"
      :model="entry.model"
    />
  </template>
</template>
