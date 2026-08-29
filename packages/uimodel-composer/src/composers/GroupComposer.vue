<script setup lang="ts">
/**
 * Rendert ein GroupWidget: optionales Label als Überschrift, darunter die
 * Kinder über den FieldsRenderer (Issue #10).
 *
 * Läuft bewusst über dieselben Composables wie der WidgetComposer, damit
 * Gruppen sich wie Widgets verhalten:
 *   - visibilityCondition wird ausgewertet (vorher wurden Gruppen immer
 *     gerendert, weil sie am WidgetComposer vorbeiliefen)
 *   - PropertyBindings greifen, insbesondere auf label (Issue #3)
 * Ohne gesetztes label bleibt das DOM unverändert.
 */
import { computed, inject } from 'vue';
import type { EObject } from '@emfts/core';
import type { GroupWidget } from '../generated/GroupWidget';
import type { WidgetComponent } from '../generated/WidgetComponent';
import { useVisibility } from '../composables/useVisibility';
import { useWidgetConfig } from '../composables/useWidgetConfig';
import { componentCssClasses, componentDataAttrs } from '../css/componentClasses';
import { STYLE_SHEETS_KEY } from '../css/useStyleSheets';
import { trackExpressionTick } from '../utils/reactivity';
import FieldsRenderer from './FieldsRenderer.vue';

const props = defineProps<{
  widget: GroupWidget;
  model: EObject;
}>();

const styleSheets = inject(STYLE_SHEETS_KEY, undefined);

const visible = useVisibility(
  () => props.widget.visibilityCondition,
  () => props.model
);

const config = useWidgetConfig(
  () => props.widget as unknown as WidgetComponent,
  () => props.model
);

/** Label aus Binding oder statischem Wert; leer/ungesetzt = keine Überschrift. */
const label = computed(() => {
  const value = config.value.label;
  return value === undefined || value === null ? '' : String(value);
});

const layout = computed(() =>
  String((props.widget as unknown as { layout?: unknown }).layout ?? 'VERTICAL').toLowerCase()
);

const cssClasses = computed(() => {
  trackExpressionTick();
  void styleSheets?.version.value;
  return [
    ...componentCssClasses(props.widget as unknown as WidgetComponent, {
      model: props.model,
      sheets: styleSheets?.sheets.value,
      resolvedCss: config.value.css,
    }),
    'uimodel-group',
    `uimodel-group--${layout.value}`,
  ];
});

const dataAttrs = computed(() =>
  componentDataAttrs(props.widget as unknown as WidgetComponent)
);

const fields = computed<WidgetComponent[]>(() => props.widget.fields ?? []);
</script>

<template>
  <div v-if="visible" :class="cssClasses" v-bind="dataAttrs">
    <div v-if="label" class="uim-group-label">{{ label }}</div>
    <FieldsRenderer :fields="fields" :model="model" />
  </div>
</template>
