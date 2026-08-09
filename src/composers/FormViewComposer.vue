<script setup lang="ts">
/**
 * Rendert eine FormView. Strukturelle Platzhalter in fields —
 * AllFeatures (Issue #4), Conditional/ForEach/GroupWidget (Issue #6) —
 * löst der FieldsRenderer auf; Layout/Überschriften gehören der
 * FormView bzw. dem Konsumenten.
 */
import type { EObject } from '@emfts/core';
import type { FormView } from '../generated/FormView';
import FieldsRenderer from './FieldsRenderer.vue';

defineProps<{
  component: FormView;
  model: EObject;
}>();
</script>

<template>
  <div class="uimodel-form-view">
    <FieldsRenderer :fields="component.fields" :model="model" />
  </div>
</template>
