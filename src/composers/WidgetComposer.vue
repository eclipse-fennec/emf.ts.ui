<script setup lang="ts">
import { computed, inject } from 'vue';
import type { EObject } from '@emfts/core';
import type { WidgetComponent } from '../generated/WidgetComponent';
import { useVisibility } from '../composables/useVisibility';
import { useWidgetConfig } from '../composables/useWidgetConfig';
import { useComponentRegistry } from '@emfts/vue-registry';
import {
  componentCssClasses,
  componentDataAttrs,
  widgetStateClasses,
} from '../css/componentClasses';
import { STYLE_SHEETS_KEY } from '../css/useStyleSheets';

const props = defineProps<{
  widget: WidgetComponent;
  model: EObject;
}>();

const { getComponentForFeature } = useComponentRegistry();

const visible = useVisibility(
  () => props.widget.visibilityCondition,
  () => props.model
);

const resolvedStyle = useWidgetConfig(
  () => props.widget,
  () => props.model
);

// feature-Binding (Issue #3) überschreibt widget.feature; null → nicht rendern
const effectiveFeature = computed(
  () => resolvedStyle.value.boundFeature ?? props.widget.feature
);

const widgetVueComponent = computed(() =>
  effectiveFeature.value
    ? getComponentForFeature(effectiveFeature.value, props.model)
    : null
);

/** Context passed via 'custom' so registered widget components can read UIModel config. */
const uiContext = computed(() => ({
  eObject: props.model,
  feature: effectiveFeature.value,
  eClass: props.model.eClass?.(),
  custom: {
    resolvedStyle: resolvedStyle.value,
    rawWidget: props.widget,
  },
}));

// CSS-Stamping: Klassen + data-Attribute fallen auf das Root-Element
// des registrierten Widget-Components durch (attribute fallthrough).
const styleSheets = inject(STYLE_SHEETS_KEY, undefined);

const cssClasses = computed(() => {
  void styleSheets?.version.value;
  return [
    ...componentCssClasses(props.widget, {
      model: props.model,
      sheets: styleSheets?.sheets.value,
      resolvedCss: resolvedStyle.value.css,
    }),
    ...widgetStateClasses(
      props.widget,
      resolvedStyle.value.readOnly,
      resolvedStyle.value.required
    ),
  ];
});

const dataAttrs = computed(() => componentDataAttrs(props.widget));
</script>

<template>
  <component
    :is="widgetVueComponent"
    v-if="visible && widgetVueComponent && !resolvedStyle.featureSuppressed"
    v-bind="{ ...uiContext, ...dataAttrs }"
    :class="cssClasses"
  />
</template>
