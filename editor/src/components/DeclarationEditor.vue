<script setup lang="ts">
/**
 * CSS-Deklarations-Editor für Objekte mit declarations/states-Containment
 * (CssStyle, StyleRule, CssState): Property/Value-Zeilen mit Vorschlägen
 * (CSS-Properties + token(...)-Referenzen) und Pseudo-State-Blöcke.
 */
import { computed, inject } from 'vue';
import type { EClass, EEnum, EObject, EReference } from '@emfts/core';
import { EDITOR_KEY } from '../editor/useEditor';
import { concreteSubclasses } from '../editor/reflect';

const props = defineProps<{
  obj: EObject;
  /** true → nur Deklarationen rendern (für verschachtelte States) */
  nested?: boolean;
}>();

const editor = inject(EDITOR_KEY)!;

const CSS_PROPERTIES = [
  'background', 'background-color', 'border', 'border-left', 'border-radius',
  'box-shadow', 'color', 'display', 'font-family', 'font-size', 'font-weight',
  'gap', 'height', 'letter-spacing', 'line-height', 'margin', 'margin-bottom',
  'max-width', 'min-height', 'opacity', 'outline', 'padding', 'padding-left',
  'text-transform', 'transition', 'width',
];

function feature(name: string): EReference | undefined {
  const f = props.obj.eClass().getEStructuralFeature(name);
  return f && 'isContainment' in f ? (f as EReference) : undefined;
}

const declarationsFeature = computed(() => feature('declarations'));
const statesFeature = computed(() => (props.nested ? undefined : feature('states')));

const declarations = computed<EObject[]>(() => {
  void editor.version.value;
  const f = declarationsFeature.value;
  return f ? Array.from(props.obj.eGet(f) as Iterable<EObject>) : [];
});

const states = computed<EObject[]>(() => {
  void editor.version.value;
  const f = statesFeature.value;
  return f ? Array.from(props.obj.eGet(f) as Iterable<EObject>) : [];
});

/** token(...)-Vorschläge aus dem StyleSheet. */
const valueSuggestions = computed(() => {
  void editor.version.value;
  return editor.data.styleSheet.tokens
    .map((t) => (t.name ? `token(${t.name})` : ''))
    .filter(Boolean);
});

const stateLiterals = computed(() => {
  const f = statesFeature.value;
  if (!f) return [];
  const stateClass = f.getEType() as EClass;
  const stateAttr = stateClass.getEStructuralFeature('state');
  const eEnum = stateAttr?.getEType() as EEnum | undefined;
  return eEnum?.getELiterals?.().map((l) => l.getName()) ?? [];
});

function eGetStr(obj: EObject, name: string): string {
  const f = obj.eClass().getEStructuralFeature(name);
  const v = f ? obj.eGet(f) : undefined;
  return v === undefined || v === null ? '' : String((v as { getName?: () => string }).getName?.() ?? v);
}

function isTrue(obj: EObject, name: string): boolean {
  const f = obj.eClass().getEStructuralFeature(name);
  const v = f ? obj.eGet(f) : undefined;
  return v === true || v === 'true';
}

function setAttr(obj: EObject, name: string, value: unknown): void {
  const f = obj.eClass().getEStructuralFeature(name);
  if (f) editor.setValue(obj, f, value);
}

function addDeclaration(): void {
  const f = declarationsFeature.value;
  if (!f) return;
  const [eClass] = concreteSubclasses(f.getEType(), editor.data.packages as never);
  if (eClass) editor.addChild(props.obj, f, eClass);
}

function addState(): void {
  const f = statesFeature.value;
  if (!f) return;
  const [eClass] = concreteSubclasses(f.getEType(), editor.data.packages as never);
  if (eClass) editor.addChild(props.obj, f, eClass);
}

function remove(obj: EObject): void {
  editor.removeObject(obj);
}

function onInput(obj: EObject, attr: string, event: Event): void {
  setAttr(obj, attr, (event.target as HTMLInputElement).value);
}

function onCheck(obj: EObject, attr: string, event: Event): void {
  setAttr(obj, attr, (event.target as HTMLInputElement).checked);
}

function onStateSelect(obj: EObject, event: Event): void {
  setAttr(obj, 'state', (event.target as HTMLSelectElement).value);
}
</script>

<template>
  <div v-if="declarationsFeature" class="decl-editor">
    <h4 v-if="!nested" class="decl-title">CSS-Deklarationen</h4>

    <datalist id="css-props"><option v-for="p in CSS_PROPERTIES" :key="p" :value="p" /></datalist>
    <datalist id="css-values"><option v-for="v in valueSuggestions" :key="v" :value="v" /></datalist>

    <div v-for="(decl, i) in declarations" :key="i" class="decl-row">
      <input
        class="prop-input decl-prop"
        type="text"
        list="css-props"
        placeholder="property"
        :value="eGetStr(decl, 'property')"
        @change="onInput(decl, 'property', $event)"
      />
      <input
        class="prop-input decl-value"
        type="text"
        list="css-values"
        placeholder="value | token(…)"
        :value="eGetStr(decl, 'value')"
        @change="onInput(decl, 'value', $event)"
      />
      <label class="decl-important" title="!important">
        <input type="checkbox" :checked="isTrue(decl, 'important')" @change="onCheck(decl, 'important', $event)" />!
      </label>
      <button class="tree-btn tree-btn--danger" title="Entfernen" @click="remove(decl)">✕</button>
    </div>
    <button class="decl-add" @click="addDeclaration">＋ Deklaration</button>

    <template v-if="statesFeature">
      <h4 class="decl-title">Pseudo-States</h4>
      <div v-for="(state, i) in states" :key="i" class="decl-state">
        <div class="decl-state__head">
          <select class="prop-input" :value="eGetStr(state, 'state')" @change="onStateSelect(state, $event)">
            <option v-for="lit in stateLiterals" :key="lit" :value="lit">{{ lit }}</option>
          </select>
          <button class="tree-btn tree-btn--danger" title="Entfernen" @click="remove(state)">✕</button>
        </div>
        <DeclarationEditor :obj="state" :nested="true" />
      </div>
      <button class="decl-add" @click="addState">＋ Pseudo-State</button>
    </template>
  </div>
</template>
