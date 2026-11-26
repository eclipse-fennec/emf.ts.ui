<script setup lang="ts">
/**
 * Rendert eine TabView als Reiterleiste (Issue #23).
 *
 * Vorher lagen alle Reiter untereinander: Die Hülle war bewusst
 * unstilisiert, aber auch ohne Funktion — eine TabView sah aus wie eine
 * Liste von Abschnitten, und jeder Host musste dieselbe Umschaltlogik
 * selbst schreiben. Das Markup bleibt schmucklos (Klassen zum Stylen,
 * keine eigenen Farben); wer mehr will, registriert wie bisher einen
 * eigenen Container unter dem Schlüssel "TabView".
 *
 * Bedienung wie im WAI-ARIA-Muster für Reiter: Pfeiltasten wechseln,
 * Pos1/Ende springen an den Rand, nur der aktive Reiter ist fokussierbar.
 */
import { computed, ref, watch, nextTick, useTemplateRef } from 'vue';
import type { EObject } from '@emfts/core';
import type { TabView } from '../generated/TabView';
import type { Component as UIComponent } from '../generated/Component';
import ComponentDispatcher from './ComponentDispatcher.vue';
import { useTranslate } from '../i18n/translate';

const props = defineProps<{
  component: TabView;
  model: EObject;
  /** Name des aktiven Reiters; ohne v-model verwaltet die TabView ihn selbst. */
  activeTab?: string;
}>();

const emit = defineEmits<{ 'update:activeTab': [name: string] }>();

const translate = useTranslate();
const tabs = computed<UIComponent[]>(() => [...(props.component.tabs ?? [])]);

/** Beschriftung: group vor name — group ist im Modell die Überschrift. */
function labelOf(tab: UIComponent): string {
  const raw = (tab as unknown as { label?: string }).label ?? tab.group ?? tab.name ?? '';
  return translate(raw, { kind: 'label', owner: tab as unknown as EObject }) ?? raw;
}

const internalActive = ref<string | undefined>(undefined);

const activeName = computed<string>(() => {
  const wanted = props.activeTab ?? internalActive.value;
  const names = tabs.value.map((t) => t.name);
  return wanted && names.includes(wanted) ? wanted : (names[0] ?? '');
});

function select(name: string) {
  internalActive.value = name;
  emit('update:activeTab', name);
}

const tabRefs = useTemplateRef<HTMLButtonElement[]>('tabButtons');

async function focusTab(name: string) {
  await nextTick();
  const index = tabs.value.findIndex((t) => t.name === name);
  tabRefs.value?.[index]?.focus();
}

function onKeydown(event: KeyboardEvent) {
  const names = tabs.value.map((t) => t.name);
  const current = names.indexOf(activeName.value);
  if (current < 0 || names.length === 0) return;

  let next: number | undefined;
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      next = (current + 1) % names.length;
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      next = (current - 1 + names.length) % names.length;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = names.length - 1;
      break;
    default:
      return;
  }
  event.preventDefault();
  select(names[next]);
  void focusTab(names[next]);
}

// Verschwindet der aktive Reiter aus dem Modell, rückt der erste nach.
watch(tabs, () => {
  if (internalActive.value && !tabs.value.some((t) => t.name === internalActive.value)) {
    internalActive.value = undefined;
  }
});

function tabId(name: string) {
  return `uimodel-tab-${props.component.name}-${name}`;
}
function panelId(name: string) {
  return `uimodel-panel-${props.component.name}-${name}`;
}
</script>

<template>
  <div class="uimodel-tab-view">
    <div class="uimodel-tab-bar" role="tablist" @keydown="onKeydown">
      <button
        v-for="tab in tabs"
        :id="tabId(tab.name)"
        ref="tabButtons"
        :key="tab.name"
        type="button"
        role="tab"
        class="uimodel-tab"
        :class="{ 'uimodel-tab--active': tab.name === activeName }"
        :aria-selected="tab.name === activeName"
        :aria-controls="panelId(tab.name)"
        :tabindex="tab.name === activeName ? 0 : -1"
        :data-tab="tab.name"
        @click="select(tab.name)"
      >
        {{ labelOf(tab) }}
      </button>
    </div>
    <div
      v-for="tab in tabs"
      v-show="tab.name === activeName"
      :id="panelId(tab.name)"
      :key="tab.name"
      class="uimodel-tab-panel"
      role="tabpanel"
      :aria-labelledby="tabId(tab.name)"
      :data-tab="tab.name"
    >
      <ComponentDispatcher :component="tab" :model="model" />
    </div>
  </div>
</template>
