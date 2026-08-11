<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import type { EObject, EStructuralFeature } from '@emfts/core';
import { evaluateBoolean } from '../utils/evaluateExpression';

const props = defineProps<{
  component: EObject; // VegaView (dynamic, no generated types)
  model: EObject;
}>();

const chartEl = ref<HTMLDivElement>();
let vegaViewInstance: any = null;

// ── helpers ────────────────────────────────────────────────────────

function eGet(obj: EObject, name: string): any {
  const eClass = obj.eClass?.();
  if (!eClass) return undefined;
  const feature = eClass.getEStructuralFeature(name);
  if (!feature) return undefined;
  return obj.eGet(feature);
}

function enumName(val: any): string | undefined {
  if (val == null) return undefined;
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && typeof val.getLiteral === 'function') return val.getLiteral();
  if (typeof val === 'object' && typeof val.getName === 'function') return val.getName();
  return String(val);
}

function toList(val: any): EObject[] {
  if (!val) return [];
  if (Symbol.iterator in Object(val)) return Array.from(val as Iterable<EObject>);
  return [val as EObject];
}

// ── data extraction ────────────────────────────────────────────────

function extractData(dataSource: EObject): Record<string, any>[] {
  const featureRef = eGet(dataSource, 'feature') as EStructuralFeature | undefined;
  if (!featureRef) return [];

  const rawData = props.model.eGet(featureRef);
  let items = toList(rawData);

  // Apply filterExpression
  const filterExpr = eGet(dataSource, 'filterExpression') as EObject | undefined;
  if (filterExpr) {
    items = items.filter((item) => {
      const lang = eGet(filterExpr, 'language') as string;
      const body = eGet(filterExpr, 'body') as string;
      return evaluateBoolean({ language: lang, body } as any, item);
    });
  }

  return items.map((item) => eObjectToRecord(item));
}

function eObjectToRecord(obj: EObject): Record<string, any> {
  const record: Record<string, any> = {};
  const eClass = obj.eClass?.();
  if (!eClass) return record;
  for (const f of eClass.getEAllStructuralFeatures()) {
    const name = f.getName?.();
    if (name) {
      const val = obj.eGet(f);
      if (val !== undefined && val !== null) record[name] = val;
    }
  }
  return record;
}

// ── spec builders ──────────────────────────────────────────────────

function buildEncoding(enc: EObject): [string, Record<string, any>] | null {
  const channelRaw = enumName(eGet(enc, 'channel'));
  if (!channelRaw) return null;

  const channel = channelRaw.toLowerCase().replace('_', '');

  const featureRef = eGet(enc, 'feature') as EStructuralFeature | undefined;
  const fieldType = enumName(eGet(enc, 'fieldType'))?.toLowerCase();
  const aggregate = enumName(eGet(enc, 'aggregate'));
  const title = eGet(enc, 'title') as string | undefined;
  const format = eGet(enc, 'format') as string | undefined;
  const value = eGet(enc, 'value') as string | undefined;
  const bin = eGet(enc, 'bin') as boolean | undefined;
  const timeUnit = enumName(eGet(enc, 'timeUnit'))?.toLowerCase();
  const sortRaw = enumName(eGet(enc, 'sort'));
  const stackRaw = enumName(eGet(enc, 'stack'));

  const def: Record<string, any> = {};

  if (value) {
    def.value = value;
  } else if (featureRef) {
    def.field = featureRef.getName?.();
  }

  if (fieldType) def.type = fieldType;
  if (aggregate && aggregate !== 'NONE') def.aggregate = aggregate.toLowerCase();
  if (title) def.title = title;
  if (format) def.format = format;
  if (bin) def.bin = true;
  if (timeUnit) def.timeUnit = timeUnit;
  if (sortRaw && sortRaw !== 'ASCENDING') {
    def.sort = sortRaw === 'NONE' ? null : sortRaw.toLowerCase();
  }
  if (stackRaw && stackRaw !== 'ZERO') {
    def.stack = stackRaw === 'NONE' ? null : stackRaw.toLowerCase();
  }

  // Scale
  const scale = eGet(enc, 'scale') as EObject | undefined;
  if (scale) def.scale = buildScale(scale);

  // Axis
  const axis = eGet(enc, 'axis') as EObject | undefined;
  if (axis) def.axis = buildAxis(axis);

  // Legend
  const legend = eGet(enc, 'legend') as EObject | undefined;
  if (legend) {
    const disable = eGet(legend, 'disable') as boolean | undefined;
    def.legend = disable ? null : buildLegend(legend);
  }

  return [channel, def];
}

function buildScale(scale: EObject): Record<string, any> {
  const s: Record<string, any> = {};
  const type = enumName(eGet(scale, 'type'));
  if (type && type !== 'LINEAR') s.type = type.toLowerCase();
  const scheme = eGet(scale, 'scheme') as string | undefined;
  if (scheme) s.scheme = scheme;
  const zero = eGet(scale, 'zero');
  if (zero !== undefined && zero !== null) s.zero = zero;
  const nice = eGet(scale, 'nice');
  if (nice !== undefined && nice !== null) s.nice = nice;
  const domain = eGet(scale, 'domain') as string[] | undefined;
  if (domain?.length) s.domain = domain;
  const range = eGet(scale, 'range') as string[] | undefined;
  if (range?.length) s.range = range;
  const reverse = eGet(scale, 'reverse');
  if (reverse) s.reverse = true;
  const padding = eGet(scale, 'padding') as number | undefined;
  if (padding) s.padding = padding;
  return s;
}

function buildAxis(axis: EObject): Record<string, any> {
  const a: Record<string, any> = {};
  const pairs: [string, string][] = [
    ['orient', 'orient'], ['title', 'title'], ['titleAngle', 'titleAngle'],
    ['titleColor', 'titleColor'], ['titleFontSize', 'titleFontSize'],
    ['labelAngle', 'labelAngle'], ['labelColor', 'labelColor'],
    ['labelFontSize', 'labelFontSize'], ['format', 'format'],
    ['tickCount', 'tickCount'], ['tickSize', 'tickSize'],
    ['offset', 'offset'],
  ];
  for (const [emf, vl] of pairs) {
    const v = eGet(axis, emf);
    if (v !== undefined && v !== null) {
      a[vl] = typeof v === 'object' && typeof v.getLiteral === 'function'
        ? v.getLiteral().toLowerCase()
        : v;
    }
  }
  const grid = eGet(axis, 'grid');
  if (grid !== undefined && grid !== null) a.grid = grid;
  const labels = eGet(axis, 'labels');
  if (labels !== undefined && labels !== null) a.labels = labels;
  const ticks = eGet(axis, 'ticks');
  if (ticks !== undefined && ticks !== null) a.ticks = ticks;
  return a;
}

function buildLegend(legend: EObject): Record<string, any> {
  const l: Record<string, any> = {};
  const orient = enumName(eGet(legend, 'orient'));
  if (orient) l.orient = orient.toLowerCase().replace('_', '-');
  const title = eGet(legend, 'title') as string | undefined;
  if (title) l.title = title;
  const direction = enumName(eGet(legend, 'direction'));
  if (direction) l.direction = direction.toLowerCase();
  return l;
}

function buildMark(markDef: EObject): string | Record<string, any> {
  const type = enumName(eGet(markDef, 'type'))?.toLowerCase() ?? 'bar';
  const markObj: Record<string, any> = { type };

  const numProps: string[] = [
    'opacity', 'strokeWidth', 'cornerRadius', 'size', 'fontSize',
    'innerRadius', 'outerRadius', 'padAngle', 'dx', 'dy', 'angle',
  ];
  const strProps: string[] = [
    'color', 'fill', 'stroke', 'cursor', 'fontWeight', 'font',
  ];
  const boolProps: string[] = [
    'filled', 'clip', 'point', 'line', 'tooltip',
  ];

  for (const p of numProps) {
    const v = eGet(markDef, p) as number | undefined;
    if (v !== undefined && v !== null && v !== 0) markObj[p] = v;
  }
  for (const p of strProps) {
    const v = eGet(markDef, p) as string | undefined;
    if (v) markObj[p] = v;
  }
  for (const p of boolProps) {
    const v = eGet(markDef, p) as boolean | undefined;
    if (v) markObj[p] = true;
  }

  const interpolate = enumName(eGet(markDef, 'interpolate'));
  if (interpolate) markObj.interpolate = interpolate.toLowerCase();
  const orient = enumName(eGet(markDef, 'orient'));
  if (orient) markObj.orient = orient.toLowerCase();
  const align = enumName(eGet(markDef, 'align'));
  if (align) markObj.align = align.toLowerCase();
  const baseline = enumName(eGet(markDef, 'baseline'));
  if (baseline) markObj.baseline = baseline.toLowerCase();

  // If only type set, return as string
  if (Object.keys(markObj).length === 1) return type;
  return markObj;
}

function buildUnitSpec(unit: EObject): Record<string, any> {
  const markDef = eGet(unit, 'mark') as EObject;
  const encodings = toList(eGet(unit, 'encodings'));

  const encoding: Record<string, any> = {};
  for (const enc of encodings) {
    const result = buildEncoding(enc);
    if (result) encoding[result[0]] = result[1];
  }

  return {
    mark: markDef ? buildMark(markDef) : 'bar',
    encoding,
  };
}

function buildLayerSpec(layer: EObject): Record<string, any> {
  const layers = toList(eGet(layer, 'layers'));
  const sharedEncodings = toList(eGet(layer, 'encodings'));

  const encoding: Record<string, any> = {};
  for (const enc of sharedEncodings) {
    const result = buildEncoding(enc);
    if (result) encoding[result[0]] = result[1];
  }

  return {
    layer: layers.map((l) => buildSpecFromContent(l)),
    ...(Object.keys(encoding).length > 0 ? { encoding } : {}),
  };
}

function buildSpecFromContent(content: EObject): Record<string, any> {
  const typeName = content.eClass?.()?.getName?.() ?? '';

  switch (typeName) {
    case 'VegaUnitSpec':
      return buildUnitSpec(content);
    case 'VegaLayerSpec':
      return buildLayerSpec(content);
    case 'VegaHConcatSpec': {
      const specs = toList(eGet(content, 'specs'));
      return { hconcat: specs.map((s) => buildSpecFromContent(s)) };
    }
    case 'VegaVConcatSpec': {
      const specs = toList(eGet(content, 'specs'));
      return { vconcat: specs.map((s) => buildSpecFromContent(s)) };
    }
    case 'VegaFacetSpec': {
      const facetField = eGet(content, 'facetField') as EStructuralFeature | undefined;
      const facetFieldType = enumName(eGet(content, 'facetFieldType'))?.toLowerCase();
      const columns = eGet(content, 'columns') as number | undefined;
      const innerSpec = eGet(content, 'spec') as EObject | undefined;
      return {
        facet: {
          field: facetField?.getName?.(),
          type: facetFieldType,
        },
        ...(columns ? { columns } : {}),
        spec: innerSpec ? buildSpecFromContent(innerSpec) : {},
      };
    }
    case 'VegaRepeatSpec': {
      const fields = eGet(content, 'fields') as string[] | undefined;
      const columns = eGet(content, 'columns') as number | undefined;
      const innerSpec = eGet(content, 'spec') as EObject | undefined;
      return {
        repeat: fields ?? [],
        ...(columns ? { columns } : {}),
        spec: innerSpec ? buildSpecFromContent(innerSpec) : {},
      };
    }
    default:
      console.warn(`[vega-composer] Unknown spec type: ${typeName}`);
      return {};
  }
}

// ── main spec builder ──────────────────────────────────────────────

function buildVegaLiteSpec(): Record<string, any> | null {
  const component = props.component;

  // 1. Escape hatch: specExpression (dynamic)
  const specExpr = eGet(component, 'specExpression') as EObject | undefined;
  if (specExpr) {
    const lang = eGet(specExpr, 'language') as string;
    const body = eGet(specExpr, 'body') as string;
    try {
      if (lang === 'JS') {
        // eslint-disable-next-line no-new-func
        const fn = new Function('self', `"use strict"; return (${body});`);
        return fn(props.model) as Record<string, any>;
      }
    } catch (e) {
      console.error('[vega-composer] specExpression failed:', e);
    }
  }

  // 2. Escape hatch: spec (static JSON)
  const specJson = eGet(component, 'spec') as string | undefined;
  if (specJson) {
    try {
      return JSON.parse(specJson);
    } catch (e) {
      console.error('[vega-composer] Invalid spec JSON:', e);
      return null;
    }
  }

  // 3. Model-driven
  const content = eGet(component, 'content') as EObject | undefined;
  const dataSource = eGet(component, 'dataSource') as EObject | undefined;
  if (!content) return null;

  // Build data
  const data = dataSource ? extractData(dataSource) : [];

  // Build spec from content tree
  const spec = buildSpecFromContent(content);
  spec.$schema = 'https://vega.github.io/schema/vega-lite/v5.json';
  spec.data = { values: data };

  // View-level config
  const title = eGet(component, 'title') as string | undefined;
  const width = eGet(component, 'width') as number | undefined;
  const height = eGet(component, 'height') as number | undefined;
  const autosize = enumName(eGet(component, 'autosize'));
  const padding = eGet(component, 'padding') as number | undefined;
  const background = eGet(component, 'background') as string | undefined;

  if (title) spec.title = title;
  if (width) spec.width = width;
  if (height) spec.height = height;
  if (autosize && autosize !== 'PAD') spec.autosize = autosize.toLowerCase().replace('_', '-');
  if (padding) spec.padding = padding;
  if (background) spec.background = background;

  // Selection params
  const params = toList(eGet(component, 'params'));
  if (params.length > 0) {
    spec.params = params.map(buildParam).filter(Boolean);
  }

  return spec;
}

function buildParam(param: EObject): Record<string, any> | null {
  const typeName = param.eClass?.()?.getName?.() ?? '';
  const name = eGet(param, 'name') as string;
  if (!name) return null;

  if (typeName === 'VegaPointParam') {
    const p: Record<string, any> = { name, select: { type: 'point' } };
    const fields = eGet(param, 'fields') as string[] | undefined;
    if (fields?.length) p.select.fields = fields;
    const toggle = eGet(param, 'toggle') as boolean | undefined;
    if (toggle) p.select.toggle = true;
    const nearest = eGet(param, 'nearest') as boolean | undefined;
    if (nearest) p.select.nearest = true;
    return p;
  }

  if (typeName === 'VegaIntervalParam') {
    const p: Record<string, any> = { name, select: { type: 'interval' } };
    const encodings = toList(eGet(param, 'encodings'));
    if (encodings.length > 0) {
      p.select.encodings = encodings.map((e) => enumName(e)?.toLowerCase());
    }
    return p;
  }

  return null;
}

// ── rendering ──────────────────────────────────────────────────────

async function renderChart() {
  if (!chartEl.value) return;

  const spec = buildVegaLiteSpec();
  if (!spec) {
    chartEl.value.innerHTML = '<p style="color:#999;font-style:italic">Keine Vega-Spec vorhanden</p>';
    return;
  }

  try {
    const { default: embed } = await import('vega-embed');
    const result = await embed(chartEl.value, spec as any, {
      actions: false,
      renderer: 'svg',
    });

    // Clean up previous view
    if (vegaViewInstance) vegaViewInstance.finalize();
    vegaViewInstance = result.view;

    // Wire signal bindings
    const signals = toList(eGet(props.component, 'signals'));
    for (const signal of signals) {
      const signalName = eGet(signal, 'signalName') as string;
      const targetFeature = eGet(signal, 'targetFeature') as EStructuralFeature | undefined;
      if (signalName && targetFeature) {
        result.view.addSignalListener(signalName, (_: string, value: any) => {
          props.model.eSet(targetFeature, value);
        });
      }
    }
  } catch (e) {
    console.error('[vega-composer] vegaEmbed failed:', e);
    chartEl.value.innerHTML = `<pre style="color:red">${e}</pre>`;
  }
}

onMounted(() => renderChart());

watch(() => [props.component, props.model], () => renderChart(), { deep: true });

onBeforeUnmount(() => {
  if (vegaViewInstance) {
    vegaViewInstance.finalize();
    vegaViewInstance = null;
  }
});
</script>

<template>
  <div class="uimodel-vega-view" ref="chartEl" />
</template>
