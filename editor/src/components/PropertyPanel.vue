<script setup lang="ts">
/**
 * Reflektives Property-Panel: rendert für jedes nicht-Containment-Feature
 * der selektierten EClass einen passenden Editor (Text, Zahl, Checkbox,
 * Enum-Select, Referenz-Select). Alle Änderungen laufen als Commands.
 */
import { computed, inject } from 'vue';
import type { EEnum, EObject, EStructuralFeature } from '@emfts/core';
import { EDITOR_KEY } from '../editor/useEditor';
import {
  isContainment,
  isEnumType,
  isReference,
  labelFor,
  reachableInstances,
} from '../editor/reflect';
import DeclarationEditor from './DeclarationEditor.vue';

const editor = inject(EDITOR_KEY)!;

const selected = computed(() => {
  void editor.version.value;
  return editor.selected.value;
});

const title = computed(() => labelFor(selected.value));

type Row = {
  feature: EStructuralFeature;
  name: string;
  kind: 'string' | 'number' | 'boolean' | 'enum' | 'ref' | 'refMany' | 'readonly';
  value: unknown;
  literals?: string[];
  candidates?: EObject[];
  items?: EObject[];
};

const SKIP_TYPES = new Set(['EInt', 'EDouble', 'ELong', 'EFloat', 'EShort', 'EBigDecimal', 'EBigInteger']);

function candidatesFor(feature: EStructuralFeature): EObject[] {
  const owner = selected.value!;
  // WidgetComponent.feature → Features der Domänen-EClass (Person)
  if (feature.getName() === 'feature') {
    return editor.data.personClass.getEAllStructuralFeatures() as unknown as EObject[];
  }
  const eType = feature.getEType();
  if (eType?.getName() === 'EClass') {
    // targetClass(es) → EClasses aller registrierten Packages
    const result: EObject[] = [];
    for (const pkg of editor.data.packages) {
      for (const classifier of pkg.getEClassifiers() as Iterable<EObject>) {
        if (typeof (classifier as { getESuperTypes?: unknown }).getESuperTypes === 'function') {
          result.push(classifier);
        }
      }
    }
    return result;
  }
  const resources = [editor.data.formResource, editor.data.stylesResource];
  const all = reachableInstances(eType, resources);
  return all.filter((c) => c !== owner);
}

const rows = computed<Row[]>(() => {
  void editor.version.value;
  const obj = selected.value;
  if (!obj) return [];
  const result: Row[] = [];
  for (const feature of obj.eClass().getEAllStructuralFeatures()) {
    if (isContainment(feature)) continue; // Containments werden im Baum editiert
    if (feature.isDerived?.()) continue;
    const name = feature.getName();
    const value = obj.eGet(feature);
    const typeName = feature.getEType()?.getName() ?? '';

    if (isReference(feature)) {
      if (feature.isMany()) {
        result.push({
          feature,
          name,
          kind: 'refMany',
          value,
          items: value ? Array.from(value as Iterable<EObject>) : [],
          candidates: candidatesFor(feature),
        });
      } else {
        result.push({ feature, name, kind: 'ref', value, candidates: candidatesFor(feature) });
      }
      continue;
    }

    if (feature.isMany()) {
      result.push({ feature, name, kind: 'readonly', value });
      continue;
    }

    if (isEnumType(feature)) {
      const literals = (feature.getEType() as EEnum).getELiterals().map((l) => l.getName());
      result.push({ feature, name, kind: 'enum', value, literals });
    } else if (typeName === 'EBoolean') {
      result.push({ feature, name, kind: 'boolean', value });
    } else if (SKIP_TYPES.has(typeName)) {
      result.push({ feature, name, kind: 'number', value });
    } else {
      result.push({ feature, name, kind: 'string', value });
    }
  }
  return result;
});

function displayValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  const v = value as { getName?: () => string };
  return String(v.getName?.() ?? value);
}

function isTrue(value: unknown): boolean {
  return value === true || value === 'true';
}

function onString(row: Row, event: Event): void {
  const raw = (event.target as HTMLInputElement).value;
  editor.setValue(selected.value!, row.feature, raw === '' ? null : raw);
}

function onNumber(row: Row, event: Event): void {
  const raw = (event.target as HTMLInputElement).value;
  editor.setValue(selected.value!, row.feature, raw === '' ? null : Number(raw));
}

function onBoolean(row: Row, event: Event): void {
  editor.setValue(selected.value!, row.feature, (event.target as HTMLInputElement).checked);
}

function onEnum(row: Row, event: Event): void {
  const raw = (event.target as HTMLSelectElement).value;
  editor.setValue(selected.value!, row.feature, raw === '' ? null : raw);
}

function onRef(row: Row, event: Event): void {
  const idx = Number((event.target as HTMLSelectElement).value);
  const target = Number.isInteger(idx) && idx >= 0 ? row.candidates?.[idx] ?? null : null;
  editor.setValue(selected.value!, row.feature, target);
}

function onAddRef(row: Row, event: Event): void {
  const sel = event.target as HTMLSelectElement;
  const idx = Number(sel.value);
  sel.value = '';
  const target = row.candidates?.[idx];
  if (target) editor.addValue(selected.value!, row.feature, target);
}

function onRemoveRef(row: Row, item: EObject): void {
  editor.removeValue(selected.value!, row.feature, item);
}

function refIndex(row: Row): number {
  return row.candidates?.findIndex((c) => c === row.value) ?? -1;
}
</script>

<template>
  <div class="property-panel">
    <p v-if="!selected" class="panel-hint">Element im Baum auswählen …</p>
    <template v-else>
      <h3 class="panel-title">{{ title }}</h3>

      <div v-for="row in rows" :key="row.name" class="prop-row">
        <label class="prop-label">{{ row.name }}</label>

        <input
          v-if="row.kind === 'string'"
          class="prop-input"
          type="text"
          :value="displayValue(row.value)"
          @change="onString(row, $event)"
        />

        <input
          v-else-if="row.kind === 'number'"
          class="prop-input"
          type="number"
          :value="displayValue(row.value)"
          @change="onNumber(row, $event)"
        />

        <input
          v-else-if="row.kind === 'boolean'"
          class="prop-check"
          type="checkbox"
          :checked="isTrue(row.value)"
          @change="onBoolean(row, $event)"
        />

        <select
          v-else-if="row.kind === 'enum'"
          class="prop-input"
          :value="displayValue(row.value)"
          @change="onEnum(row, $event)"
        >
          <option value="">—</option>
          <option v-for="lit in row.literals" :key="lit" :value="lit">{{ lit }}</option>
        </select>

        <select
          v-else-if="row.kind === 'ref'"
          class="prop-input"
          :value="refIndex(row) >= 0 ? String(refIndex(row)) : ''"
          @change="onRef(row, $event)"
        >
          <option value="">—</option>
          <option v-for="(c, i) in row.candidates" :key="i" :value="String(i)">
            {{ labelFor(c) }}
          </option>
        </select>

        <div v-else-if="row.kind === 'refMany'" class="prop-ref-many">
          <div v-for="(item, i) in row.items" :key="i" class="prop-ref-item">
            <span class="prop-ref-label">{{ labelFor(item) }}</span>
            <button class="tree-btn tree-btn--danger" title="Entfernen" @click="onRemoveRef(row, item)">✕</button>
          </div>
          <select class="prop-input" value="" @change="onAddRef(row, $event)">
            <option value="" disabled>+ hinzufügen …</option>
            <option v-for="(c, i) in row.candidates" :key="i" :value="String(i)">
              {{ labelFor(c) }}
            </option>
          </select>
        </div>

        <span v-else class="prop-readonly">{{ displayValue(row.value) || '—' }}</span>
      </div>

      <!-- CSS-Deklarationen/States für CssStyle, StyleRule, CssState -->
      <DeclarationEditor :obj="selected" />
    </template>
  </div>
</template>
