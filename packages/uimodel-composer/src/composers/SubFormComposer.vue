<script setup lang="ts">
/**
 * Rendert ein SubFormWidget: eine Containment-Referenz als Unterformular
 * ([Issue #25](https://github.com/eclipse-fennec/emf.ts.ui/issues/25)).
 *
 * Containments landeten bisher wie jede andere Referenz beim
 * ReferenceLinkWidget — die Attribute eines enthaltenen Objekts waren
 * nicht zu bearbeiten, und bei `[0..*]` ließ sich kein Kind anlegen oder
 * entfernen. Hier stehen die Felder des Kindes im selben Formular:
 *
 *   [0..1] / [1]  ein Unterformular; fehlt das Kind, legt eine
 *                 Schaltfläche es an (`createClass`, sonst der
 *                 Referenztyp — abstrakt geht nicht)
 *   [0..*]        eine Liste von Unterformularen mit Hinzufügen,
 *                 Entfernen und Umsortieren
 *
 * `fields` beschreibt das Kind — ein AllFeatures-Platzhalter mit seinen
 * Fällen genügt. Wie bei jeder Expansion steht die Widget-Wahl im Modell
 * (#5); ohne `fields` rendert das Unterformular nichts und sagt es
 * einmal auf der Konsole. Gegen rekursive Modelle (Ordner im Ordner)
 * begrenzt `maxDepth` die Schachtelung — die Tiefe läuft über
 * provide/inject mit.
 */
import { computed, inject, provide } from 'vue';
import type { EClass, EList, EObject, EReference, EStructuralFeature } from '@emfts/core';
import type { SubFormWidget } from '../generated/SubFormWidget';
import type { WidgetComponent } from '../generated/WidgetComponent';
import { useVisibility } from '../composables/useVisibility';
import { useWidgetConfig } from '../composables/useWidgetConfig';
import { componentCssClasses, componentDataAttrs } from '../css/componentClasses';
import { STYLE_SHEETS_KEY } from '../css/useStyleSheets';
import { bumpExpressionTick, trackExpressionTick } from '../utils/reactivity';
import { isSet } from '../utils/isSet';
import { useTranslate } from '../i18n/translate';
import { SUBFORM_DEPTH_KEY } from '../composables/subFormDepth';
import FieldsRenderer from './FieldsRenderer.vue';

const props = defineProps<{
  widget: SubFormWidget;
  model: EObject;
}>();

const styleSheets = inject(STYLE_SHEETS_KEY, undefined);
const translate = useTranslate();

const depth = inject(SUBFORM_DEPTH_KEY, 0);
provide(SUBFORM_DEPTH_KEY, depth + 1);

const asWidget = computed(() => props.widget as unknown as WidgetComponent);

const visible = useVisibility(
  () => props.widget.visibilityCondition,
  () => props.model
);

const config = useWidgetConfig(
  () => asWidget.value,
  () => props.model
);

const feature = computed<EStructuralFeature | undefined>(
  () => config.value.boundFeature ?? props.widget.feature
);

const reference = computed<EReference | undefined>(() => {
  const f = feature.value;
  return f && 'getEReferenceType' in f ? (f as EReference) : undefined;
});

const many = computed(() => {
  const upper = feature.value?.getUpperBound?.();
  return upper === -1 || (typeof upper === 'number' && upper > 1);
});

/** Erreichte Tiefe — darüber wird nur noch ein Hinweis gezeigt. */
const maxDepth = computed(() => {
  const value = Number(props.widget.maxDepth);
  return Number.isFinite(value) && value > 0 ? value : 3;
});
const tooDeep = computed(() => depth >= maxDepth.value);

const readOnly = computed(() => config.value.readOnly === true);

function allowed(name: 'allowAdd' | 'allowRemove' | 'allowReorder'): boolean {
  if (readOnly.value) return false;
  const widget = props.widget as unknown as EObject;
  return isSet(widget, name) ? props.widget[name] === true : true;
}

const canAdd = computed(() => allowed('allowAdd'));
const canRemove = computed(() => allowed('allowRemove'));
const canReorder = computed(() => allowed('allowReorder'));

/** Klasse, die beim Anlegen erzeugt wird. */
const createClass = computed<EClass | undefined>(
  () => props.widget.createClass ?? reference.value?.getEReferenceType?.() ?? undefined
);

const canCreate = computed(() => {
  const eClass = createClass.value;
  return !!eClass && eClass.isAbstract?.() !== true && !!eClass.getEPackage?.();
});

/** Das enthaltene Objekt (einwertig) bzw. die Liste (mehrwertig). */
const child = computed<EObject | undefined>(() => {
  trackExpressionTick();
  if (many.value || !feature.value) return undefined;
  return (props.model.eGet(feature.value) as EObject | null) ?? undefined;
});

const childList = computed<EList<EObject> | undefined>(() => {
  trackExpressionTick();
  if (!many.value || !feature.value) return undefined;
  const value = props.model.eGet(feature.value) as EList<EObject> | undefined;
  return value && typeof value.size === 'function' ? value : undefined;
});

const children = computed<EObject[]>(() => (childList.value ? [...childList.value] : []));

/** Bereits gemeldete Widgets ohne fields (eine Meldung genügt). */
const warnedEmpty = new Set<string>();

/** Die Felder, mit denen das Kind gerendert wird. */
const childFields = computed<WidgetComponent[]>(() => {
  const own = [...(props.widget.fields ?? [])];
  if (own.length === 0) {
    const key = props.widget.name ?? '?';
    if (!warnedEmpty.has(key)) {
      warnedEmpty.add(key);
      console.error(
        `[uimodel-composer] SubFormWidget "${key}": keine fields — die Felder des ` +
          'enthaltenen Objekts gehören ins Modell (AllFeatures-Platzhalter mit cases).'
      );
    }
  }
  return own;
});

function create(): EObject | undefined {
  const eClass = createClass.value;
  const factory = eClass?.getEPackage?.()?.getEFactoryInstance?.();
  if (!eClass || !factory) return undefined;
  return factory.create(eClass);
}

function addChild() {
  if (!canAdd.value || !feature.value) return;
  const created = create();
  if (!created) return;
  if (many.value) childList.value?.add(created);
  else props.model.eSet(feature.value, created);
  bumpExpressionTick();
}

function removeChild(index: number) {
  if (!canRemove.value || !feature.value) return;
  if (many.value) childList.value?.removeAt(index);
  else props.model.eSet(feature.value, null);
  bumpExpressionTick();
}

function move(from: number, to: number) {
  if (!canReorder.value) return;
  if (to < 0 || to >= children.value.length) return;
  childList.value?.move(to, from);
  bumpExpressionTick();
}

const label = computed(() => {
  const value = config.value.label;
  return value === undefined || value === null ? '' : String(value);
});

const addLabel = computed(() => {
  const raw = props.widget.addLabel;
  return (
    translate(raw, { kind: 'label', owner: props.widget as unknown as EObject }) ??
    raw ??
    'Hinzufügen'
  );
});

const emptyText = computed(() => {
  const raw = props.widget.emptyText;
  return raw
    ? (translate(raw, { kind: 'text', owner: props.widget as unknown as EObject }) ?? raw)
    : '';
});

const cssClasses = computed(() => {
  trackExpressionTick();
  void styleSheets?.version.value;
  return [
    ...componentCssClasses(asWidget.value, {
      model: props.model,
      sheets: styleSheets?.sheets.value,
      resolvedCss: config.value.css,
    }),
    'uimodel-subform',
    ...(many.value ? ['uimodel-subform--many'] : []),
  ];
});

const dataAttrs = computed(() => componentDataAttrs(asWidget.value));
</script>

<template>
  <div v-if="visible && feature" :class="cssClasses" v-bind="dataAttrs">
    <div v-if="label" class="uimodel-subform-label">{{ label }}</div>

    <p v-if="tooDeep" class="uimodel-subform-depth">
      Weitere Schachtelung ausgelassen (maxDepth {{ maxDepth }}).
    </p>

    <!-- einwertig -->
    <template v-else-if="!many">
      <div v-if="child" class="uimodel-subform-body">
        <FieldsRenderer :fields="childFields" :model="child" />
        <button
          v-if="canRemove"
          type="button"
          class="uimodel-subform-remove"
          @click="removeChild(0)"
        >
          ×
        </button>
      </div>
      <template v-else>
        <p v-if="emptyText" class="uimodel-subform-empty">{{ emptyText }}</p>
        <button
          v-if="canAdd && canCreate"
          type="button"
          class="uimodel-subform-add"
          @click="addChild()"
        >
          {{ addLabel }}
        </button>
      </template>
    </template>

    <!-- mehrwertig -->
    <template v-else>
      <p v-if="!children.length && emptyText" class="uimodel-subform-empty">{{ emptyText }}</p>
      <ul v-if="children.length" class="uimodel-subform-items">
        <li v-for="(item, index) in children" :key="index" class="uimodel-subform-item">
          <FieldsRenderer :fields="childFields" :model="item" />
          <button
            v-if="canReorder"
            type="button"
            class="uimodel-subform-up"
            :disabled="index === 0"
            :aria-label="`Nach oben: ${index + 1}`"
            @click="move(index, index - 1)"
          >
            ↑
          </button>
          <button
            v-if="canReorder"
            type="button"
            class="uimodel-subform-down"
            :disabled="index === children.length - 1"
            :aria-label="`Nach unten: ${index + 1}`"
            @click="move(index, index + 1)"
          >
            ↓
          </button>
          <button
            v-if="canRemove"
            type="button"
            class="uimodel-subform-remove"
            :aria-label="`Entfernen: ${index + 1}`"
            @click="removeChild(index)"
          >
            ×
          </button>
        </li>
      </ul>
      <button
        v-if="canAdd && canCreate"
        type="button"
        class="uimodel-subform-add"
        @click="addChild()"
      >
        {{ addLabel }}
      </button>
    </template>
  </div>
</template>
