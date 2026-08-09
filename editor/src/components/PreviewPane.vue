<script setup lang="ts">
/**
 * Live-Preview: rendert das UIModel über den UIModelComposer mit den
 * aktiven StyleSheets. Theme-Umschalter (Token-Overrides), Personen-
 * Auswahl und CSS-Quelltext-Ansicht.
 */
import { computed, inject, ref } from 'vue';
import { UIModelComposer, useStyleSheetCss, themeClass } from '@emfts/uimodel-composer';
import type { StyleSheet } from '@emfts/uimodel-composer/css';
import { EDITOR_KEY } from '../editor/useEditor';

const editor = inject(EDITOR_KEY)!;

const personIndex = ref(0);
const activeTheme = ref<string>('');
const view = ref<'preview' | 'css'>('preview');

// UIModel-Auswahl: autoriertes Formular vs. generisches AllFeatures-Layout
const uiModels = [
  { label: 'person-form', model: editor.data.uiModel },
  { label: 'generic-default', model: editor.data.genericModel },
];
const uiModelIndex = ref(0);
const activeUiModel = computed(() => uiModels[uiModelIndex.value].model);

const sheets = computed<StyleSheet[]>(() => [editor.data.styleSheet]);
const { css } = useStyleSheetCss(() => sheets.value);

const persons = editor.data.persons;

function personLabel(p: (typeof persons)[number]): string {
  const ec = p.eClass();
  const get = (n: string) => {
    const f = ec.getEStructuralFeature(n);
    return f ? String(p.eGet(f) ?? '') : '';
  };
  return `${get('firstName')} ${get('lastName')}`.trim() || 'Person';
}

const themes = computed(() => {
  void editor.version.value;
  return editor.data.styleSheet.themes.map((t) => t.name ?? '').filter(Boolean);
});

const scopeClasses = computed(() => [
  'uicss-scope',
  'preview-scope',
  activeTheme.value ? themeClass(activeTheme.value) : '',
]);

/** Selektierte Komponente in der Preview markieren. */
const highlightCss = computed(() => {
  void editor.version.value;
  const obj = editor.selected.value;
  if (!obj) return '';
  const eClass = obj.eClass?.();
  const isComponent = eClass?.getEAllSuperTypes?.().some((s) => s.getName() === 'Component')
    || eClass?.getName() === 'Component';
  if (!isComponent) return '';
  const nameFeature = eClass!.getEStructuralFeature('name');
  const name = nameFeature ? obj.eGet(nameFeature) : undefined;
  if (!name) return '';
  return `.preview-scope [data-uim-name="${String(name)}"] { outline: 2px dashed #e11d90; outline-offset: 3px; }`;
});
</script>

<template>
  <div class="preview-pane">
    <div class="preview-toolbar">
      <label>
        UIModel:
        <select v-model.number="uiModelIndex">
          <option v-for="(m, i) in uiModels" :key="m.label" :value="i">{{ m.label }}</option>
        </select>
      </label>
      <label>
        Person:
        <select v-model.number="personIndex">
          <option v-for="(p, i) in persons" :key="i" :value="i">{{ personLabel(p) }}</option>
        </select>
      </label>
      <label>
        Theme:
        <select v-model="activeTheme">
          <option value="">Standard</option>
          <option v-for="t in themes" :key="t" :value="t">{{ t }}</option>
        </select>
      </label>
      <nav class="preview-tabs">
        <button :class="['tab', { 'tab--active': view === 'preview' }]" @click="view = 'preview'">Vorschau</button>
        <button :class="['tab', { 'tab--active': view === 'css' }]" @click="view = 'css'">Generiertes CSS</button>
      </nav>
    </div>

    <div v-if="view === 'preview'" :class="scopeClasses">
      <component :is="'style'">{{ highlightCss }}</component>
      <UIModelComposer
        :key="`${uiModelIndex}-${editor.version.value}`"
        :ui-model="activeUiModel"
        :model="persons[personIndex]"
        :style-sheets="sheets"
      />
    </div>

    <pre v-else class="css-source"><code>{{ css }}</code></pre>
  </div>
</template>
