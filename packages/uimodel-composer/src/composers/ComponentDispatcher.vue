<script setup lang="ts">
import { computed, inject } from 'vue';
import type { EObject } from '@emfts/core';
import type { Component as UiComponent } from '../generated/Component';
import { useComposerRegistry } from '../composables/useComposerRegistry';
import { componentCssClasses, componentDataAttrs } from '../css/componentClasses';
import { STYLE_SHEETS_KEY } from '../css/useStyleSheets';
import { resolveStyleList } from '../utils/resolveStyleChain';
import { trackExpressionTick } from '../utils/reactivity';

const props = defineProps<{
  component: UiComponent;
  model: EObject;
}>();

const registry = useComposerRegistry();

const composer = computed(() => {
  const eclassName = props.component.eClass?.()?.getName?.() ?? '';
  const found = registry.getComposer(eclassName);
  if (!found) {
    console.warn(`[uimodel-composer] No composer registered for EClass "${eclassName}"`);
  }
  return found ?? null;
});

// CSS-Stamping: Klassen + data-Attribute fallen auf das Root-Element
// des jeweiligen Composers durch (attribute fallthrough).
const styleSheets = inject(STYLE_SHEETS_KEY, undefined);

const cssClasses = computed(() => {
  trackExpressionTick();
  void styleSheets?.version.value;
  return componentCssClasses(props.component, {
    model: props.model,
    sheets: styleSheets?.sheets.value,
    resolvedCss: resolveStyleList(props.component.styles ?? []).css,
  });
});

const dataAttrs = computed(() => componentDataAttrs(props.component));
</script>

<template>
  <component
    :is="composer"
    v-if="composer"
    :component="component"
    :model="model"
    :class="cssClasses"
    v-bind="dataAttrs"
  />
</template>
