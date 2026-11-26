<script setup lang="ts">
/**
 * Rendert ein ListWidget: ein mehrwertiges Attribut als Liste mit
 * Hinzufügen, Entfernen und Umsortieren
 * ([Issue #24](https://github.com/eclipse-fennec/emf.ts.ui/issues/24)).
 *
 * Bisher bekam ein `EString [0..*]` dasselbe Eingabefeld wie ein
 * einwertiges — gebunden an eine EList, also unbrauchbar. Bearbeitet
 * wird die Liste **an Ort und Stelle** (`set`, `add`, `removeAt`,
 * `move`), damit Notifications und der Expression-Tick greifen; eine
 * neue Liste zu setzen würde beides umgehen.
 *
 * Das Eingabefeld je Element richtet sich nach dem Datentyp. Wer mehr
 * will, registriert über `registerWidgetClass(registry, 'ListWidget', …)`
 * einen eigenen Renderer (#21) — dann kommt dieser Composer nicht zum
 * Zug.
 */
import { computed, inject } from 'vue';
import type { EEnum, EEnumLiteral, EList, EObject, EStructuralFeature } from '@emfts/core';
import type { ListWidget } from '../generated/ListWidget';
import type { WidgetComponent } from '../generated/WidgetComponent';
import { useVisibility } from '../composables/useVisibility';
import { useWidgetConfig } from '../composables/useWidgetConfig';
import { componentCssClasses, componentDataAttrs } from '../css/componentClasses';
import { STYLE_SHEETS_KEY } from '../css/useStyleSheets';
import { bumpExpressionTick, trackExpressionTick } from '../utils/reactivity';
import { isSet } from '../utils/isSet';
import { useTranslate } from '../i18n/translate';

const props = defineProps<{
  widget: ListWidget;
  model: EObject;
}>();

const styleSheets = inject(STYLE_SHEETS_KEY, undefined);
const translate = useTranslate();

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

/** Die EList des gebundenen Features — nur sie wird verändert. */
const list = computed<EList<unknown> | undefined>(() => {
  trackExpressionTick();
  const f = feature.value;
  if (!f) return undefined;
  const value = props.model.eGet(f) as EList<unknown> | undefined;
  return value && typeof (value as EList<unknown>).size === 'function' ? value : undefined;
});

const items = computed<unknown[]>(() => (list.value ? [...list.value] : []));

const label = computed(() => {
  const value = config.value.label;
  return value === undefined || value === null ? '' : String(value);
});

const readOnly = computed(() => config.value.readOnly === true);

/** Erlaubt, solange nichts anderes im Modell steht und nicht schreibgeschützt. */
function allowed(name: 'allowAdd' | 'allowRemove' | 'allowReorder'): boolean {
  if (readOnly.value) return false;
  const widget = props.widget as unknown as EObject;
  return isSet(widget, name) ? props.widget[name] === true : true;
}

const canAdd = computed(() => allowed('allowAdd'));
const canRemove = computed(() => allowed('allowRemove'));
const canReorder = computed(() => allowed('allowReorder'));

const enumType = computed<EEnum | undefined>(() => {
  const type = feature.value?.getEType?.();
  return type && 'getELiterals' in type ? (type as EEnum) : undefined;
});

const literals = computed<EEnumLiteral[]>(() => {
  const values = enumType.value?.getELiterals?.();
  return values ? [...(values as Iterable<EEnumLiteral>)] : [];
});

/** Art des Eingabefelds — aus dem Datentyp des gebundenen Features. */
const kind = computed<'checkbox' | 'number' | 'date' | 'enum' | 'text'>(() => {
  if (enumType.value) return 'enum';
  const typeName = feature.value?.getEType?.()?.getName?.() ?? '';
  if (typeName === 'EBoolean' || typeName === 'EBooleanObject') return 'checkbox';
  if (
    ['EInt', 'ELong', 'EShort', 'EFloat', 'EDouble', 'EBigDecimal', 'EBigInteger'].includes(
      typeName
    )
  ) {
    return 'number';
  }
  if (typeName === 'EDate') return 'date';
  return 'text';
});

/** Anzeigewert eines Elements im Eingabefeld. */
function displayValue(item: unknown): string {
  if (item === null || item === undefined) return '';
  if (item instanceof Date) return item.toISOString().split('T')[0];
  return String(item);
}

/** Eingabe zurück in den Typ des Features. */
function parseValue(raw: string | boolean): unknown {
  switch (kind.value) {
    case 'checkbox':
      return Boolean(raw);
    case 'number': {
      const n = Number(raw);
      return Number.isNaN(n) ? 0 : n;
    }
    case 'date':
      return raw ? new Date(String(raw)) : null;
    default:
      return String(raw);
  }
}

/** Startwert eines neuen Elements. */
function emptyValue(): unknown {
  switch (kind.value) {
    case 'checkbox':
      return false;
    case 'number':
      return 0;
    case 'date':
      return new Date();
    case 'enum':
      return literals.value[0]?.getName?.() ?? literals.value[0]?.getLiteral?.() ?? '';
    default:
      return '';
  }
}

function update(index: number, raw: string | boolean) {
  if (readOnly.value) return;
  list.value?.set(index, parseValue(raw));
  bumpExpressionTick();
}

function add() {
  if (!canAdd.value) return;
  list.value?.add(emptyValue());
  bumpExpressionTick();
}

function removeAt(index: number) {
  if (!canRemove.value) return;
  list.value?.removeAt(index);
  bumpExpressionTick();
}

function move(from: number, to: number) {
  if (!canReorder.value) return;
  if (to < 0 || to >= items.value.length) return;
  list.value?.move(to, from);
  bumpExpressionTick();
}

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
    'uimodel-list',
  ];
});

const dataAttrs = computed(() => componentDataAttrs(asWidget.value));

function itemId(index: number) {
  return `uimodel-list-${props.widget.name}-${index}`;
}
</script>

<template>
  <div v-if="visible && feature" :class="cssClasses" v-bind="dataAttrs">
    <div v-if="label" class="uimodel-list-label">{{ label }}</div>
    <p v-if="!items.length && emptyText" class="uimodel-list-empty">{{ emptyText }}</p>
    <ul v-if="items.length" class="uimodel-list-items">
      <li v-for="(item, index) in items" :key="index" class="uimodel-list-item">
        <input
          v-if="kind === 'checkbox'"
          :id="itemId(index)"
          type="checkbox"
          :checked="Boolean(item)"
          :disabled="readOnly"
          @change="update(index, ($event.target as HTMLInputElement).checked)"
        />
        <select
          v-else-if="kind === 'enum'"
          :id="itemId(index)"
          :value="displayValue(item)"
          :disabled="readOnly"
          @change="update(index, ($event.target as HTMLSelectElement).value)"
        >
          <option
            v-for="(literal, index) in literals"
            :key="literal.getName?.() ?? index"
            :value="literal.getName?.() ?? ''"
          >
            {{ literal.getName?.() ?? literal.getLiteral?.() }}
          </option>
        </select>
        <input
          v-else
          :id="itemId(index)"
          :type="kind === 'number' ? 'number' : kind === 'date' ? 'date' : 'text'"
          :value="displayValue(item)"
          :placeholder="config.placeholder"
          :disabled="readOnly"
          @input="update(index, ($event.target as HTMLInputElement).value)"
        />
        <button
          v-if="canReorder"
          type="button"
          class="uimodel-list-up"
          :disabled="index === 0"
          :aria-label="`Nach oben: ${index + 1}`"
          @click="move(index, index - 1)"
        >
          ↑
        </button>
        <button
          v-if="canReorder"
          type="button"
          class="uimodel-list-down"
          :disabled="index === items.length - 1"
          :aria-label="`Nach unten: ${index + 1}`"
          @click="move(index, index + 1)"
        >
          ↓
        </button>
        <button
          v-if="canRemove"
          type="button"
          class="uimodel-list-remove"
          :aria-label="`Entfernen: ${index + 1}`"
          @click="removeAt(index)"
        >
          ×
        </button>
      </li>
    </ul>
    <button v-if="canAdd" type="button" class="uimodel-list-add" @click="add()">
      {{ addLabel }}
    </button>
  </div>
</template>
