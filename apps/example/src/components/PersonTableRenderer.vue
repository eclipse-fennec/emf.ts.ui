<script setup lang="ts">
import { inject, type Ref } from 'vue';
import type { EObject } from '@emfts/core';
import type { TableView } from '@emfts/uimodel-composer';
import { SELECTED_PERSON_KEY, PERSONS_KEY } from '../emf/selectionContext';

defineProps<{
  component: TableView;
  model: EObject;
}>();

const selectionRef = inject<Ref<EObject>>(SELECTED_PERSON_KEY)!;
const persons      = inject<EObject[]>(PERSONS_KEY, []);

function isActive(p: EObject) { return selectionRef.value === p; }
function select(p: EObject)   { selectionRef.value = p; }

function getVal(p: EObject, name: string): string {
  const feature = p.eClass().getEStructuralFeature(name);
  if (!feature) return '';
  return (p.eGet(feature) as string) ?? '';
}
</script>

<template>
  <nav class="person-list">
    <button
      v-for="(person, i) in persons"
      :key="i"
      class="person-item"
      :class="{ 'person-item--active': isActive(person) }"
      @click="select(person)"
    >
      <span class="person-item__name">
        {{ getVal(person, 'firstName') }} {{ getVal(person, 'lastName') }}
      </span>
      <span class="person-item__role">{{ getVal(person, 'jobTitle') }}</span>
    </button>
  </nav>
</template>
