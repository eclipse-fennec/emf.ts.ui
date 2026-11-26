<script setup lang="ts">
import { computed, inject } from 'vue';
import type { EObject } from '@emfts/core';
import type { WidgetComponent } from '../generated/WidgetComponent';
import { useVisibility } from '../composables/useVisibility';
import { useWidgetConfig } from '../composables/useWidgetConfig';
import { useValidation } from '../composables/useValidation';
import { useComponentRegistry } from '@emfts/vue-registry';
import { buildWidgetMatchContext } from '../registry/widgetRegistry';
import {
  componentCssClasses,
  componentDataAttrs,
  widgetStateClasses,
} from '../css/componentClasses';
import { STYLE_SHEETS_KEY } from '../css/useStyleSheets';
import { trackExpressionTick } from '../utils/reactivity';
import FallbackWidget from './FallbackWidget.vue';

const props = defineProps<{
  widget: WidgetComponent;
  model: EObject;
}>();

/** Bereits gemeldete Widget-Klassen ohne Renderer (eine Warnung genügt). */
const warnedEClasses = new Set<string>();

const { getComponent } = useComponentRegistry();

const visible = useVisibility(
  () => props.widget.visibilityCondition,
  () => props.model
);

const resolvedStyle = useWidgetConfig(
  () => props.widget,
  () => props.model
);

// feature-Binding (Issue #3) überschreibt widget.feature; null → nicht rendern
const effectiveFeature = computed(
  () => resolvedStyle.value.boundFeature ?? props.widget.feature
);

/**
 * Validierungen des Widgets — einschließlich der Required-Prüfung, die
 * `expandFeatures` erzeugt. Bisher wertete sie nur aus, wer in seinem
 * eigenen Editor `useValidation` aufrief; mit dem Default-Editor eines
 * Hosts blieb sie wirkungslos (#22).
 */
const validation = useValidation(
  () => props.widget.validations ?? [],
  () => props.model,
  {
    label: () => resolvedStyle.value.label,
    feature: () => effectiveFeature.value,
  }
);

/**
 * Match-Kontext der Registry: Feature **und** Widget-Klasse des Modells
 * (#21). Ohne eine Registrierung auf die Widget-Klasse wählt die Registry
 * daraus dasselbe wie zuvor aus dem Feature allein.
 */
const matchContext = computed(() =>
  buildWidgetMatchContext(props.widget, effectiveFeature.value, props.model, {
    resolvedStyle: resolvedStyle.value,
    rawWidget: props.widget,
  })
);

/**
 * Renderer aus der Registry; liefert sie nichts (z. B. Widget-Klasse aus
 * einem Extension-Paket ohne registrierten Renderer), degradiert der
 * Composer definiert auf FallbackWidget statt still leer zu bleiben (#9).
 */
const widgetVueComponent = computed(() => {
  if (!effectiveFeature.value) return null;
  const registered = getComponent(matchContext.value);
  if (registered) return registered;

  const eclassName = props.widget.eClass?.()?.getName?.() ?? 'WidgetComponent';
  const typeName = effectiveFeature.value.getEType?.()?.getName?.() ?? '?';
  const key = `${eclassName}/${typeName}`;
  if (!warnedEClasses.has(key)) {
    warnedEClasses.add(key);
    console.warn(
      `[uimodel-composer] Kein Renderer für Widget "${eclassName}" auf Datentyp ` +
        `"${typeName}" registriert — Fallback als Plaintext-Editor. ` +
        'Host: Renderer über die @emfts/vue-registry registrieren.'
    );
  }
  return FallbackWidget;
});

/**
 * Props des gerenderten Editors. `custom` trägt wie bisher die aufgelöste
 * Widget-Konfiguration; label, readonly, placeholder und required gehen
 * zusätzlich als eigene Props mit, damit auch Editoren ohne Kenntnis des
 * UI-Modells die Entscheidungen des Modells übernehmen (#22).
 */
const uiContext = computed(() => ({
  eObject: props.model,
  feature: effectiveFeature.value,
  eClass: props.model.eClass?.(),
  ...(resolvedStyle.value.label !== undefined ? { label: resolvedStyle.value.label } : {}),
  ...(resolvedStyle.value.readOnly !== undefined
    ? { readonly: resolvedStyle.value.readOnly }
    : {}),
  ...(resolvedStyle.value.placeholder !== undefined
    ? { placeholder: resolvedStyle.value.placeholder }
    : {}),
  ...(resolvedStyle.value.required !== undefined
    ? { required: resolvedStyle.value.required }
    : {}),
  ...(validation.value
    ? {
        invalid: true,
        validationMessage: validation.value.message,
        validationSeverity: validation.value.severity,
      }
    : {}),
  custom: matchContext.value.custom,
}));

/**
 * Zeigt der Editor die Meldung selbst an? Konvention: Wer eine Prop
 * `validationMessage` oder `invalid` deklariert (oder `useValidation`
 * selbst aufruft und das über `emftsHandlesValidation` sagt), bekommt sie
 * durchgereicht und rendert sie; sonst gibt der Composer sie aus.
 */
const editorShowsValidation = computed(() => {
  const component = widgetVueComponent.value as
    | { props?: string[] | Record<string, unknown>; emftsHandlesValidation?: boolean }
    | null;
  if (!component) return false;
  if (component.emftsHandlesValidation === true) return true;
  const declared = component.props;
  const names = Array.isArray(declared) ? declared : declared ? Object.keys(declared) : [];
  return names.includes('validationMessage') || names.includes('invalid');
});

// CSS-Stamping: Klassen + data-Attribute fallen auf das Root-Element
// des registrierten Widget-Components durch (attribute fallthrough).
const styleSheets = inject(STYLE_SHEETS_KEY, undefined);

const cssClasses = computed(() => {
  trackExpressionTick();
  void styleSheets?.version.value;
  return [
    ...componentCssClasses(props.widget, {
      model: props.model,
      sheets: styleSheets?.sheets.value,
      resolvedCss: resolvedStyle.value.css,
    }),
    ...widgetStateClasses(
      props.widget,
      resolvedStyle.value.readOnly,
      resolvedStyle.value.required,
      !!validation.value
    ),
  ];
});

const dataAttrs = computed(() => componentDataAttrs(props.widget));
</script>

<template>
  <component
    :is="widgetVueComponent"
    v-if="visible && widgetVueComponent && !resolvedStyle.featureSuppressed"
    v-bind="{ ...uiContext, ...dataAttrs }"
    :class="cssClasses"
  />
  <p
    v-if="
      visible &&
      widgetVueComponent &&
      !resolvedStyle.featureSuppressed &&
      validation &&
      !editorShowsValidation
    "
    class="uimodel-widget-message"
    :class="`uimodel-severity-${validation.severity.toLowerCase()}`"
    role="alert"
  >
    {{ validation.message }}
  </p>
</template>
