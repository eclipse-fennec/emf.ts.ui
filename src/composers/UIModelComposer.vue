<script setup lang="ts">
import { computed, provide } from 'vue';
import type { EObject } from '@emfts/core';
import type { UIModel } from '../generated/UIModel';
import type { StyleSheet } from '../generated/css/StyleSheet';
import {
  COMPOSER_REGISTRY_KEY,
  createComposerRegistry,
  type ComposerRegistry,
} from '../composables/useComposerRegistry';
import { STYLE_SHEETS_KEY, useStyleSheetInjection } from '../css/useStyleSheets';
import { collectExpansionContext } from '../allfeatures/expandFeatures';
import { EXPANSION_CONTEXT_KEY } from '../allfeatures/context';
import { evaluateBoolean } from '../utils/evaluateExpression';
import ComponentDispatcher from './ComponentDispatcher.vue';
import AllFeaturesComposer from './AllFeaturesComposer.vue';
import FormViewComposer from './FormViewComposer.vue';
import SectionViewComposer from './SectionViewComposer.vue';
import TabViewComposer from './TabViewComposer.vue';
import SummaryViewComposer from './SummaryViewComposer.vue';
import TableViewComposer from './TableViewComposer.vue';
import MasterDetailComposer from './MasterDetailComposer.vue';
import VegaViewComposer from './VegaViewComposer.vue';
import MapViewComposer from './MapViewComposer.vue';

const props = defineProps<{
  /** The loaded UIModel instance */
  uiModel: UIModel;
  /** The domain EObject to render */
  model: EObject;
  /**
   * Optional registry override — use to inject additional or replacement composers.
   * If omitted, the default registry (FormView, TableView, …) is used.
   */
  composerRegistry?: ComposerRegistry;
  /**
   * Optionale CSS-StyleSheets (uimodel-css). Werden als <style>-Element
   * injiziert; Selektor-Regeln und uic-Klassen wirken auf die von den
   * Composern gestempelten uim-*-Klassen.
   */
  styleSheets?: StyleSheet[];
}>();

const sheets = computed<readonly StyleSheet[]>(() => props.styleSheets ?? []);
const { version: styleVersion } = useStyleSheetInjection(sheets);
provide(STYLE_SHEETS_KEY, { sheets, version: styleVersion });

// AllFeatures: Dedup-Kontext pro UIModel (Geschwister-Blöcke +
// explizit gebundene Widgets) für die Zuordnungs-Semantik.
provide(
  EXPANSION_CONTEXT_KEY,
  computed(() => collectExpansionContext(props.uiModel as unknown as EObject))
);

// Build and provide the ComposerRegistry for this subtree
const registry =
  props.composerRegistry ??
  createComposerRegistry({
    FormView: FormViewComposer,
    SectionView: SectionViewComposer,
    TabView: TabViewComposer,
    SummaryView: SummaryViewComposer,
    TableView: TableViewComposer,
    MasterDetail: MasterDetailComposer,
    AllFeatures: AllFeaturesComposer,
    VegaView: VegaViewComposer,
    MapView: MapViewComposer,
  });

provide(COMPOSER_REGISTRY_KEY, registry);

/**
 * Whether the UIModel applies to the current domain object.
 * filterExpression absence = applies to all.
 */
function modelApplies(): boolean {
  return evaluateBoolean(props.uiModel.filterExpression, props.model);
}
</script>

<template>
  <template v-if="modelApplies()">
    <ComponentDispatcher
      v-for="component in uiModel.components"
      :key="component.name"
      :component="component"
      :model="model"
    />
  </template>
</template>
