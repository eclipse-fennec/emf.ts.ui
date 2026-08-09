<script setup lang="ts">
/**
 * Outline über beide Modell-Wurzeln: UIModel (person-form.xmi)
 * und StyleSheet (styles.xmi).
 */
import { inject } from 'vue';
import type { EObject } from '@emfts/core';
import { EDITOR_KEY } from '../editor/useEditor';
import TreeNode from './TreeNode.vue';

const editor = inject(EDITOR_KEY)!;

const roots: { title: string; obj: EObject }[] = [
  { title: 'UI-Modell (person-form.xmi)', obj: editor.data.uiModel as unknown as EObject },
  { title: 'Generisch (generic-default.uimodel.xmi)', obj: editor.data.genericModel as unknown as EObject },
  { title: 'StyleSheet (styles.xmi)', obj: editor.data.styleSheet as unknown as EObject },
];
</script>

<template>
  <div class="model-tree">
    <section v-for="root in roots" :key="root.title" class="tree-section">
      <h3 class="tree-section__title">{{ root.title }}</h3>
      <ul class="tree-children tree-children--root">
        <TreeNode :obj="root.obj" :is-root="true" />
      </ul>
    </section>
  </div>
</template>
