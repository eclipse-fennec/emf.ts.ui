<script setup lang="ts">
/**
 * Baumknoten über der Containment-Struktur eines EObjects.
 *
 * Kinder werden pro Containment-Feature gruppiert („fields (5)“) und
 * direkt an der Gruppe angelegt: ein Typ → sofort, mehrere Typen →
 * kompaktes Typ-Menü. Aktionen erscheinen bei Hover, der Pfad zur
 * Selektion klappt automatisch auf.
 */
import { computed, inject, ref, watch } from 'vue';
import type { EClass, EObject, EReference } from '@emfts/core';
import { EDITOR_KEY } from '../editor/useEditor';
import { concreteSubclasses, containmentFeatures } from '../editor/reflect';

const props = defineProps<{
  obj: EObject;
  isRoot?: boolean;
}>();

// Stabile Keys über Objekt-Identität — Index-Keys lassen Komponenten-
// Zustand (offene Menüs, Aufklappung) nach Löschen/Einfügen verrutschen.
const nodeIds = new WeakMap<object, number>();
let nextNodeId = 1;
function nodeId(obj: object): number {
  let id = nodeIds.get(obj);
  if (!id) {
    id = nextNodeId++;
    nodeIds.set(obj, id);
  }
  return id;
}

const editor = inject(EDITOR_KEY)!;
const expanded = ref(true);
const collapsedGroups = ref(new Set<string>());
const openMenu = ref<string | null>(null);

// ── Labels ──────────────────────────────────────────────────────────
function attr(obj: EObject, name: string): string {
  const f = obj.eClass?.()?.getEStructuralFeature?.(name);
  const v = f ? obj.eGet(f) : undefined;
  if (v === undefined || v === null || v === '') return '';
  return String((v as { getName?: () => string }).getName?.() ?? v);
}

/** Sprechendes Label je EClass (primär) + Typname (sekundär). */
const label = computed(() => {
  void editor.version.value;
  const obj = props.obj;
  const eclass = obj.eClass?.()?.getName?.() ?? '?';
  switch (eclass) {
    case 'CssDeclaration': {
      const p = attr(obj, 'property');
      const v = attr(obj, 'value');
      return { primary: p ? `${p}: ${v}` : '(leer)', secondary: '' };
    }
    case 'DesignToken':
      return { primary: `${attr(obj, 'name')} = ${attr(obj, 'value')}`, secondary: 'Token' };
    case 'TokenOverride': {
      const f = obj.eClass().getEStructuralFeature('token');
      const token = f ? (obj.eGet(f) as EObject | undefined) : undefined;
      return { primary: `${token ? attr(token, 'name') : '?'} → ${attr(obj, 'value')}`, secondary: '' };
    }
    case 'CssState':
      return { primary: `:${attr(obj, 'state').toLowerCase()}`, secondary: 'State' };
    case 'Expression':
    case 'ValidationExpression': {
      const body = attr(obj, 'body');
      return { primary: body.length > 32 ? `${body.slice(0, 32)}…` : body || '(leer)', secondary: eclass };
    }
    default: {
      const primary = attr(obj, 'name') || attr(obj, 'label');
      return primary ? { primary, secondary: eclass } : { primary: eclass, secondary: '' };
    }
  }
});

/** Farbpunkt nach Element-Art. */
const kind = computed(() => {
  const n = props.obj.eClass?.()?.getName?.() ?? '';
  if (n === 'UIModel' || n === 'StyleSheet') return 'root';
  if (n.endsWith('Widget')) return 'widget';
  if (n.endsWith('View') || n === 'MasterDetail') return 'view';
  if (n === 'DesignToken' || n === 'TokenOverride') return 'token';
  if (n === 'Theme') return 'theme';
  if (n.endsWith('Style')) return 'style';
  if (n === 'StyleRule' || n === 'CssState' || n === 'CssDeclaration') return 'rule';
  return 'misc';
});

const isSelected = computed(() => editor.selected.value === props.obj);

// ── Gruppen (Containment-Features) ──────────────────────────────────
interface Group {
  feature: EReference;
  name: string;
  children: EObject[];
  addTypes: EClass[];
}

function allGroups(): Group[] {
  const result: Group[] = [];
  for (const feature of containmentFeatures(props.obj.eClass())) {
    const value = props.obj.eGet(feature);
    const children = feature.isMany()
      ? value
        ? [...(value as Iterable<EObject>)]
        : []
      : value
        ? [value as EObject]
        : [];
    // anlegbar, solange many oder (einwertig und leer)
    const addTypes =
      feature.isMany() || children.length === 0
        ? concreteSubclasses(feature.getEType(), editor.data.packages as never)
        : [];
    if (children.length > 0 || addTypes.length > 0) {
      result.push({ feature, name: feature.getName(), children, addTypes });
    }
  }
  return result;
}

/** Nur befüllte Gruppen im Baum anzeigen — leere machen ihn unlesbar. */
const groups = computed<Group[]>(() => {
  void editor.version.value;
  return allGroups().filter((g) => g.children.length > 0);
});

/** Anlegbare Features fürs „+“-Menü am Knoten (auch leere). */
const addableGroups = computed<Group[]>(() => {
  void editor.version.value;
  return allGroups().filter((g) => g.addTypes.length > 0);
});

const hasContent = computed(() => groups.value.length > 0);

// ── Aktionen ────────────────────────────────────────────────────────
function onSelect(): void {
  editor.select(props.obj);
}

function onAdd(group: Group, eClass: EClass): void {
  editor.addChild(props.obj, group.feature, eClass);
  openMenu.value = null;
  expanded.value = true;
  collapsedGroups.value.delete(group.name);
}

function onAddClick(group: Group): void {
  if (group.addTypes.length === 1) {
    onAdd(group, group.addTypes[0]);
  } else {
    openMenu.value = openMenu.value === group.name ? null : group.name;
  }
}

/** „+“ am Knoten: ein einziger Kandidat → sofort anlegen, sonst Menü. */
function onNodeAddClick(): void {
  const groups_ = addableGroups.value;
  if (groups_.length === 1 && groups_[0].addTypes.length === 1) {
    onAdd(groups_[0], groups_[0].addTypes[0]);
  } else {
    openMenu.value = openMenu.value === '__node__' ? null : '__node__';
  }
}

function toggleGroup(name: string): void {
  if (collapsedGroups.value.has(name)) collapsedGroups.value.delete(name);
  else collapsedGroups.value.add(name);
  collapsedGroups.value = new Set(collapsedGroups.value);
}

function onRemove(): void {
  editor.removeObject(props.obj);
}

// ── Auto-Aufklappen zur Selektion ───────────────────────────────────
function containsObj(parent: EObject, target: EObject): boolean {
  for (const feature of containmentFeatures(parent.eClass())) {
    const value = parent.eGet(feature);
    if (!value) continue;
    const children = feature.isMany()
      ? [...(value as Iterable<EObject>)]
      : [value as EObject];
    for (const child of children) {
      if (child === target || containsObj(child, target)) return true;
    }
  }
  return false;
}

watch(
  () => [editor.selected.value, editor.version.value] as const,
  ([sel]) => {
    if (!sel || sel === props.obj) return;
    if (containsObj(props.obj, sel)) {
      expanded.value = true;
      for (const group of groups.value) {
        if (group.children.some((c) => c === sel || containsObj(c, sel))) {
          collapsedGroups.value.delete(group.name);
        }
      }
      collapsedGroups.value = new Set(collapsedGroups.value);
    }
  }
);
</script>

<template>
  <li class="tree-node">
    <div :class="['tree-row', { 'tree-row--selected': isSelected }]" @click.stop="onSelect">
      <button
        v-if="hasContent"
        class="tree-toggle"
        :aria-label="expanded ? 'Einklappen' : 'Ausklappen'"
        @click.stop="expanded = !expanded"
      >{{ expanded ? '▾' : '▸' }}</button>
      <span v-else class="tree-toggle tree-toggle--leaf"></span>

      <span :class="['tree-dot', `tree-dot--${kind}`]" aria-hidden="true"></span>
      <span class="tree-name" :title="label.primary">{{ label.primary }}</span>
      <span v-if="label.secondary" class="tree-type">{{ label.secondary }}</span>

      <span class="tree-actions">
        <button
          v-if="addableGroups.length > 0"
          class="tree-btn tree-btn--add tree-btn--node-add"
          title="Kind hinzufügen …"
          @click.stop="onNodeAddClick"
        >＋</button>
        <button
          v-if="!isRoot"
          class="tree-btn tree-btn--danger"
          title="Löschen"
          @click.stop="onRemove"
        >✕</button>
      </span>
    </div>

    <div v-if="openMenu === '__node__'" class="tree-add-menu" @click.stop>
      <template v-for="group in addableGroups" :key="group.name">
        <div class="tree-add-caption">{{ group.name }}</div>
        <button
          v-for="type in group.addTypes"
          :key="`${group.name}-${type.getName()}`"
          class="tree-add-option"
          @click.stop="onAdd(group, type)"
        >{{ type.getName() }}</button>
      </template>
    </div>

    <ul v-if="expanded" class="tree-children">
      <li v-for="group in groups" :key="group.name" class="tree-group">
        <div class="tree-group-row" @click.stop="toggleGroup(group.name)">
          <span class="tree-group-toggle">{{ collapsedGroups.has(group.name) ? '▸' : '▾' }}</span>
          <span class="tree-group-name">{{ group.name }}</span>
          <span v-if="group.children.length" class="tree-group-count">{{ group.children.length }}</span>
          <button
            v-if="group.addTypes.length > 0"
            class="tree-btn tree-btn--add"
            :title="group.addTypes.length === 1
              ? `${group.addTypes[0].getName()} hinzufügen`
              : `${group.name} hinzufügen …`"
            @click.stop="onAddClick(group)"
          >＋</button>
        </div>

        <div v-if="openMenu === group.name" class="tree-add-menu" @click.stop>
          <button
            v-for="type in group.addTypes"
            :key="type.getName()"
            class="tree-add-option"
            @click.stop="onAdd(group, type)"
          >{{ type.getName() }}</button>
        </div>

        <ul v-if="!collapsedGroups.has(group.name) && group.children.length" class="tree-children">
          <TreeNode
            v-for="child in group.children"
            :key="nodeId(child)"
            :obj="child"
          />
        </ul>
      </li>
    </ul>
  </li>
</template>
