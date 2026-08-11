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
import { collectExpansionContext, collectOverlayCases } from '../allfeatures/expandFeatures';
import type { UIModelOverlay } from '../generated/UIModelOverlay';
import { EXPANSION_CONTEXT_KEY } from '../allfeatures/context';
import { evaluateBoolean } from '../utils/evaluateExpression';
import { trackExpressionTick, useModelTick } from '../utils/reactivity';
import ComponentDispatcher from './ComponentDispatcher.vue';
import FormViewComposer from './FormViewComposer.vue';
import SectionViewComposer from './SectionViewComposer.vue';
import TabViewComposer from './TabViewComposer.vue';
import SummaryViewComposer from './SummaryViewComposer.vue';
import TableViewComposer from './TableViewComposer.vue';
import MasterDetailComposer from './MasterDetailComposer.vue';

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
  /**
   * Workspace-Overlays (Issue #8): TemplateCases daraus übersteuern die
   * Widget-Wahl der AllFeatures-Expansion (vor lokalen cases geprüft).
   * Der Composer lädt nichts selbst — Sammeln/Priorisieren übernimmt
   * der Konsument (hier nur die Reihung via collectOverlayCases).
   */
  overlays?: UIModelOverlay[];
}>();

const sheets = computed<readonly StyleSheet[]>(() => props.styleSheets ?? []);
const { version: styleVersion } = useStyleSheetInjection(sheets);
provide(STYLE_SHEETS_KEY, { sheets, version: styleVersion });

// Live-Reaktivität (Issue #7): EContentAdapter am Domänenobjekt bumpt
// den Expression-Tick — Bindings/Visibility/Validierung/Strukturen und
// condition-StyleRules reagieren damit sofort auf eSet-Änderungen.
useModelTick(() => props.model);

// AllFeatures: Dedup-Kontext pro UIModel (Geschwister-Blöcke +
// explizit gebundene Widgets) für die Zuordnungs-Semantik.
provide(
  EXPANSION_CONTEXT_KEY,
  computed(() => {
    trackExpressionTick();
    return {
      ...collectExpansionContext(props.uiModel as unknown as EObject),
      overlayCases: collectOverlayCases(props.overlays ?? []),
    };
  })
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
