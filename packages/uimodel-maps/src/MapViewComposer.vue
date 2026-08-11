<script setup lang="ts">
import { ref, inject, watch, onMounted, onBeforeUnmount } from 'vue';
import type { EObject, EStructuralFeature } from '@emfts/core';
import { evaluateBoolean } from '@emfts/uimodel-composer';
import { MAP_SELECTION_KEY, type MapSelectionHandler } from './useMapSelection';

const props = defineProps<{
  component: EObject; // MapView (dynamic, no generated types)
  model: EObject;
}>();

// Optional: ancestor can react to feature clicks (in addition to MapSelectionBinding eSet)
const onSelection = inject<MapSelectionHandler | null>(MAP_SELECTION_KEY, null);

const mapEl = ref<HTMLDivElement>();
const popupEl = ref<HTMLDivElement>();
let olMap: any = null;
let popupOverlay: any = null;

// ── helpers (analog VegaViewComposer) ───────────────────────────────

function eGet(obj: EObject, name: string): any {
  const eClass = obj.eClass?.();
  if (!eClass) return undefined;
  const feature = eClass.getEStructuralFeature(name);
  if (!feature) return undefined;
  return obj.eGet(feature);
}

/** Read a feature and coerce to a finite number (XMI stores numeric attrs as strings). */
function eNum(obj: EObject, name: string): number | undefined {
  const v = eGet(obj, name);
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
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

function className(obj: EObject | undefined): string {
  return obj?.eClass?.()?.getName?.() ?? '';
}

function eObjectToRecord(obj: EObject): Record<string, any> {
  const record: Record<string, any> = {};
  const eClass = obj.eClass?.();
  if (!eClass) return record;
  for (const f of eClass.getEAllStructuralFeatures()) {
    const name = f.getName?.();
    if (!name) continue;
    const val = obj.eGet(f);
    if (val === undefined || val === null) continue;
    if (typeof val === 'object') {
      // Enum literal → store its name as string; skip nested EObjects/lists
      if (typeof val.getLiteral === 'function' || typeof val.getName === 'function') {
        record[name] = enumName(val);
      }
    } else {
      record[name] = val;
    }
  }
  return record;
}

/** Convert "#rrggbb"/"#rgb" + alpha → "rgba(...)"; pass through other formats. */
function colorWithOpacity(color: string | undefined, opacity: number | undefined): string | undefined {
  if (!color) return undefined;
  const a = opacity == null ? 1 : opacity;
  if (a >= 1) return color;
  const hex = color.trim();
  let r: number, g: number, b: number;
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (/^#[0-9a-f]{6}$/i.test(hex)) {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  } else {
    return color; // named / rgb(a) — leave as-is
  }
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

const lineDashFor: Record<string, number[] | undefined> = {
  SOLID: undefined,
  DASH: [8, 6],
  DOT: [1, 5],
  DASH_DOT: [8, 6, 1, 6],
};

// OL modules (lazy-loaded in renderMap)
let ol: any = null;

async function loadOl() {
  if (ol) return ol;
  const [
    Map, View, TileLayer, VectorLayerCls, OSM, XYZ, TileWMS, VectorSourceCls,
    GeoJSON, WKT, Feature, Point, proj, Style, CircleStyle, RegularShape,
    Fill, Stroke, Text, control, Overlay,
  ] = await Promise.all([
    import('ol/Map'), import('ol/View'), import('ol/layer/Tile'), import('ol/layer/Vector'),
    import('ol/source/OSM'), import('ol/source/XYZ'), import('ol/source/TileWMS'), import('ol/source/Vector'),
    import('ol/format/GeoJSON'), import('ol/format/WKT'), import('ol/Feature'), import('ol/geom/Point'),
    import('ol/proj'), import('ol/style/Style'), import('ol/style/Circle'), import('ol/style/RegularShape'),
    import('ol/style/Fill'), import('ol/style/Stroke'), import('ol/style/Text'), import('ol/control'),
    import('ol/Overlay'),
  ]);
  ol = {
    Map: Map.default, View: View.default, TileLayer: TileLayer.default,
    VectorLayer: VectorLayerCls.default, OSM: OSM.default, XYZ: XYZ.default,
    TileWMS: TileWMS.default, VectorSource: VectorSourceCls.default,
    GeoJSON: GeoJSON.default, WKT: WKT.default, Feature: Feature.default,
    Point: Point.default, transform: proj.transform, transformExtent: proj.transformExtent,
    Style: Style.default, CircleStyle: CircleStyle.default, RegularShape: RegularShape.default,
    Fill: Fill.default, Stroke: Stroke.default, Text: Text.default,
    defaultControls: control.defaults, ScaleLine: control.ScaleLine, Overlay: Overlay.default,
  };
  return ol;
}

// ── geometry / feature building ─────────────────────────────────────

const EOBJECT_KEY = '__emfObject';

function readGeometry(record: any, src: EObject, srcCrs: string, viewProj: string): any {
  const lonF = eGet(src, 'longitudeFeature') as EStructuralFeature | undefined;
  const latF = eGet(src, 'latitudeFeature') as EStructuralFeature | undefined;
  const geomF = eGet(src, 'geometryFeature') as EStructuralFeature | undefined;

  if (lonF && latF) {
    const lon = Number(record[lonF.getName?.() ?? '']);
    const lat = Number(record[latF.getName?.() ?? '']);
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      return new ol.Point(ol.transform([lon, lat], srcCrs, viewProj));
    }
    return null;
  }

  if (geomF) {
    const raw = record[geomF.getName?.() ?? ''];
    if (typeof raw !== 'string' || !raw) return null;
    const format = enumName(eGet(src, 'geometryFormat')) ?? 'WKT';
    try {
      const reader = format === 'GEOJSON' ? new ol.GeoJSON() : new ol.WKT();
      return reader.readGeometry(raw, { dataProjection: srcCrs, featureProjection: viewProj });
    } catch (e) {
      console.warn('[map-composer] geometry parse failed:', e);
      return null;
    }
  }
  return null;
}

function buildEmfFeatures(src: EObject, viewProj: string): any[] {
  const featureRef = eGet(src, 'feature') as EStructuralFeature | undefined;
  if (!featureRef) return [];
  const srcCrs = (eGet(src, 'sourceCrs') as string) || 'EPSG:4326';

  let items = toList(props.model.eGet(featureRef));

  const filterExpr = eGet(src, 'filterExpression') as EObject | undefined;
  if (filterExpr) {
    const lang = eGet(filterExpr, 'language') as string;
    const body = eGet(filterExpr, 'body') as string;
    items = items.filter((item) => evaluateBoolean({ language: lang, body } as any, item));
  }

  const features: any[] = [];
  for (const item of items) {
    const record = eObjectToRecord(item);
    const geometry = readGeometry(record, src, srcCrs, viewProj);
    if (!geometry) continue;
    // Pass the geometry directly; copy attributes individually so a model
    // attribute literally named "geometry" can't clobber OL's reserved key.
    const f = new ol.Feature(geometry);
    for (const [k, v] of Object.entries(record)) {
      if (k === 'geometry') continue;
      f.set(k, v);
    }
    f.set(EOBJECT_KEY, item);
    features.push(f);
  }
  return features;
}

async function buildVectorSource(src: EObject, viewProj: string): Promise<any> {
  const typeName = className(src);
  const srcCrs = (eGet(src, 'sourceCrs') as string) || 'EPSG:4326';

  if (typeName === 'EmfFeatureSource') {
    return new ol.VectorSource({ features: buildEmfFeatures(src, viewProj) });
  }
  if (typeName === 'InlineGeoJSONSource') {
    const geojson = eGet(src, 'geojson') as string | undefined;
    if (!geojson) return new ol.VectorSource();
    const features = new ol.GeoJSON().readFeatures(geojson, {
      dataProjection: srcCrs,
      featureProjection: viewProj,
    });
    return new ol.VectorSource({ features });
  }
  if (typeName === 'GeoJSONUrlSource') {
    const url = eGet(src, 'url') as string | undefined;
    const vs = new ol.VectorSource();
    if (url) {
      try {
        const res = await fetch(url);
        const json = await res.text();
        vs.addFeatures(new ol.GeoJSON().readFeatures(json, {
          dataProjection: srcCrs,
          featureProjection: viewProj,
        }));
      } catch (e) {
        console.error('[map-composer] GeoJSON URL load failed:', e);
      }
    }
    return vs;
  }
  console.warn(`[map-composer] Unknown VectorSource: ${typeName}`);
  return new ol.VectorSource();
}

// ── symbol → ol/style ───────────────────────────────────────────────

function buildImage(symbol: EObject): any {
  const shape = enumName(eGet(symbol, 'shape')) ?? 'CIRCLE';
  const size = eNum(symbol, 'size') ?? 6;
  const opacity = eNum(symbol, 'opacity');
  const fill = new ol.Fill({ color: colorWithOpacity(eGet(symbol, 'color') as string, opacity) });
  const stroke = new ol.Stroke({
    color: eGet(symbol, 'strokeColor') as string,
    width: eNum(symbol, 'strokeWidth') ?? 1,
  });
  const rotation = (eNum(symbol, 'rotation') ?? 0) * (Math.PI / 180);

  if (shape === 'CIRCLE') {
    return new ol.CircleStyle({ radius: size, fill, stroke });
  }
  const cfg: Record<string, any> = { fill, stroke, radius: size, rotation };
  switch (shape) {
    case 'SQUARE': cfg.points = 4; cfg.angle = Math.PI / 4; break;
    case 'TRIANGLE': cfg.points = 3; cfg.angle = 0; break;
    case 'DIAMOND': cfg.points = 4; cfg.angle = 0; break;
    case 'STAR': cfg.points = 5; cfg.radius2 = size * 0.4; cfg.angle = 0; break;
    case 'CROSS': cfg.points = 4; cfg.radius2 = 0; cfg.angle = 0; break;
    case 'X': cfg.points = 4; cfg.radius2 = 0; cfg.angle = Math.PI / 4; break;
    default: cfg.points = 4;
  }
  return new ol.RegularShape(cfg);
}

function buildStyle(symbol: EObject | undefined): any {
  if (!symbol) return undefined;
  const typeName = className(symbol);
  const opacity = eGet(symbol, 'opacity') as number | undefined;
  const opts: Record<string, any> = {};

  if (typeName === 'MarkerSymbol') {
    opts.image = buildImage(symbol);
  } else if (typeName === 'LineSymbol') {
    const style = enumName(eGet(symbol, 'style')) ?? 'SOLID';
    opts.stroke = new ol.Stroke({
      color: colorWithOpacity(eGet(symbol, 'color') as string, opacity),
      width: eNum(symbol, 'width') ?? 1.5,
      lineDash: lineDashFor[style],
    });
  } else if (typeName === 'FillSymbol') {
    const style = enumName(eGet(symbol, 'style')) ?? 'SOLID';
    if (style !== 'NONE') {
      opts.fill = new ol.Fill({ color: colorWithOpacity(eGet(symbol, 'fillColor') as string, opacity) });
    }
    opts.stroke = new ol.Stroke({
      color: eGet(symbol, 'strokeColor') as string,
      width: eNum(symbol, 'strokeWidth') ?? 1,
    });
  }

  return new ol.Style(opts);
}

function buildLabelStyle(labeling: EObject): any {
  const placement = enumName(eGet(labeling, 'placement')) ?? 'OVER_POINT';
  const offsetX = eNum(labeling, 'offsetX') ?? 0;
  const offsetY = eNum(labeling, 'offsetY') ?? 0;
  const haloColor = eGet(labeling, 'haloColor') as string | undefined;
  const haloWidth = eNum(labeling, 'haloWidth');

  let textAlign = 'center';
  let textBaseline = 'middle';
  let dx = offsetX;
  let dy = offsetY;
  switch (placement) {
    case 'ABOVE': textBaseline = 'bottom'; dy -= 8; break;
    case 'BELOW': textBaseline = 'top'; dy += 8; break;
    case 'LEFT': textAlign = 'right'; dx -= 8; break;
    case 'RIGHT': textAlign = 'left'; dx += 8; break;
    case 'CENTER':
    case 'OVER_POINT': default: break;
  }

  return {
    font: (eGet(labeling, 'font') as string) ?? '12px sans-serif',
    fill: new ol.Fill({ color: (eGet(labeling, 'color') as string) ?? '#333' }),
    stroke: haloColor ? new ol.Stroke({ color: haloColor, width: haloWidth ?? 2 }) : undefined,
    textAlign,
    textBaseline,
    offsetX: dx,
    offsetY: dy,
  };
}

// ── renderer → style function ───────────────────────────────────────

function labelTextFor(feature: any, labeling: EObject | undefined): string | undefined {
  if (!labeling) return undefined;
  const labelF = eGet(labeling, 'feature') as EStructuralFeature | undefined;
  if (labelF) {
    const v = feature.get(labelF.getName?.() ?? '');
    return v == null ? undefined : String(v);
  }
  const expr = eGet(labeling, 'expression') as EObject | undefined;
  if (expr) {
    const obj = feature.get(EOBJECT_KEY);
    // reuse boolean-style evaluator's underlying expression via JS only
    try {
      const lang = eGet(expr, 'language') as string;
      const body = eGet(expr, 'body') as string;
      if (lang === 'JS' && obj) {
        // eslint-disable-next-line no-new-func
        const fn = new Function('self', `"use strict"; return (${body});`);
        const r = fn(obj);
        return r == null ? undefined : String(r);
      }
    } catch (e) {
      console.warn('[map-composer] label expression failed:', e);
    }
  }
  return undefined;
}

function pickSymbol(renderer: EObject, feature: any): EObject | undefined {
  const typeName = className(renderer);

  if (typeName === 'SingleSymbolRenderer') {
    return eGet(renderer, 'symbol') as EObject | undefined;
  }

  if (typeName === 'CategorizedRenderer') {
    const classF = eGet(renderer, 'classificationFeature') as EStructuralFeature | undefined;
    const val = classF ? feature.get(classF.getName?.() ?? '') : undefined;
    const categories = toList(eGet(renderer, 'categories'));
    const match = categories.find((c) => String(eGet(c, 'value')) === String(val));
    if (match) return eGet(match, 'symbol') as EObject;
    return eGet(renderer, 'defaultSymbol') as EObject | undefined;
  }

  if (typeName === 'GraduatedRenderer') {
    const classF = eGet(renderer, 'classificationFeature') as EStructuralFeature | undefined;
    const num = classF ? Number(feature.get(classF.getName?.() ?? '')) : NaN;
    const classes = toList(eGet(renderer, 'classes'));
    const match = classes.find((c) => {
      const lo = eNum(c, 'lowerBound') ?? -Infinity;
      const hi = eNum(c, 'upperBound') ?? Infinity;
      return num >= lo && num <= hi;
    });
    return match ? (eGet(match, 'symbol') as EObject) : undefined;
  }

  if (typeName === 'RuleBasedRenderer') {
    const rules = toList(eGet(renderer, 'rules'));
    const obj = feature.get(EOBJECT_KEY);
    let elseRule: EObject | undefined;
    for (const rule of rules) {
      if (eGet(rule, 'elseRule')) { elseRule = rule; continue; }
      const expr = eGet(rule, 'filterExpression') as EObject | undefined;
      if (!expr) return eGet(rule, 'symbol') as EObject;
      const lang = eGet(expr, 'language') as string;
      const body = eGet(expr, 'body') as string;
      if (obj && evaluateBoolean({ language: lang, body } as any, obj)) {
        return eGet(rule, 'symbol') as EObject;
      }
    }
    return elseRule ? (eGet(elseRule, 'symbol') as EObject) : undefined;
  }

  console.warn(`[map-composer] Unknown Renderer: ${typeName}`);
  return undefined;
}

function buildStyleFunction(renderer: EObject, labeling: EObject | undefined) {
  return (feature: any) => {
    const symbol = pickSymbol(renderer, feature);
    if (!symbol) return undefined;
    const style = buildStyle(symbol);
    const text = labelTextFor(feature, labeling);
    if (text && style) {
      style.setText(new ol.Text({ text, ...buildLabelStyle(labeling as EObject) }));
    }
    return style;
  };
}

// ── layers ──────────────────────────────────────────────────────────

function applyLayerProps(layer: any, layerDef: EObject): void {
  const visible = eGet(layerDef, 'visible');
  if (visible === false) layer.setVisible(false);
  const opacity = eNum(layerDef, 'opacity');
  if (opacity != null) layer.setOpacity(opacity);
  const minZoom = eNum(layerDef, 'minZoom');
  if (minZoom != null) layer.setMinZoom(minZoom);
  const maxZoom = eNum(layerDef, 'maxZoom');
  if (maxZoom != null) layer.setMaxZoom(maxZoom);
}

async function buildLayer(layerDef: EObject, viewProj: string): Promise<any | null> {
  const typeName = className(layerDef);
  const attribution = eGet(layerDef, 'attribution') as string | undefined;
  let layer: any = null;

  if (typeName === 'XYZTileLayer') {
    const urlTemplate = eGet(layerDef, 'urlTemplate') as string | undefined;
    const maxZoomLevel = eNum(layerDef, 'maxZoomLevel');
    const source = urlTemplate
      ? new ol.XYZ({ url: urlTemplate, maxZoom: maxZoomLevel, attributions: attribution })
      : new ol.OSM();
    layer = new ol.TileLayer({ source });
  } else if (typeName === 'WMSLayer') {
    layer = new ol.TileLayer({
      source: new ol.TileWMS({
        url: eGet(layerDef, 'url') as string,
        params: {
          LAYERS: eGet(layerDef, 'layers') as string,
          FORMAT: (eGet(layerDef, 'format') as string) ?? 'image/png',
          VERSION: (eGet(layerDef, 'version') as string) ?? '1.3.0',
          TRANSPARENT: eGet(layerDef, 'transparent') !== false,
        },
        attributions: attribution,
      }),
    });
  } else if (typeName === 'VectorLayer') {
    const source = await buildVectorSource(eGet(layerDef, 'source') as EObject, viewProj);
    const renderer = eGet(layerDef, 'renderer') as EObject;
    const labeling = eGet(layerDef, 'labeling') as EObject | undefined;
    layer = new ol.VectorLayer({
      source,
      style: buildStyleFunction(renderer, labeling),
    });
  } else {
    console.warn(`[map-composer] Unknown MapLayer: ${typeName}`);
    return null;
  }

  applyLayerProps(layer, layerDef);
  return layer;
}

// ── click bindings + popup ──────────────────────────────────────────

function setupInteractions(): void {
  const bindings = toList(eGet(props.component, 'bindings'));
  const layers = toList(eGet(props.component, 'layers'));
  const popupTemplate = layers
    .map((l) => eGet(l, 'popupTemplate') as string | undefined)
    .find(Boolean);

  if (bindings.length === 0 && !popupTemplate && !onSelection) return;

  // Cursor-Pointer, wenn ein (klickbares) Feature unter dem Mauszeiger liegt
  olMap.on('pointermove', (evt: any) => {
    if (evt.dragging) return;
    const hit = olMap.hasFeatureAtPixel(evt.pixel);
    const target = olMap.getTargetElement?.();
    if (target) target.style.cursor = hit ? 'pointer' : '';
  });

  olMap.on('click', (evt: any) => {
    const feature = olMap.forEachFeatureAtPixel(evt.pixel, (f: any) => f);
    if (!feature) {
      if (popupOverlay) popupOverlay.setPosition(undefined);
      onSelection?.(undefined, props.component);
      return;
    }
    const obj = feature.get(EOBJECT_KEY) as EObject | undefined;

    // Write bindings back into the EMF model
    for (const binding of bindings) {
      const targetFeature = eGet(binding, 'targetFeature') as EStructuralFeature | undefined;
      if (!targetFeature) continue;
      const sourceFeature = eGet(binding, 'sourceFeature') as EStructuralFeature | undefined;
      const value = sourceFeature && obj ? obj.eGet(sourceFeature) : obj;
      try {
        props.model.eSet(targetFeature, value);
      } catch (e) {
        console.warn('[map-composer] binding eSet failed:', e);
      }
    }

    // Popup
    if (popupTemplate && popupOverlay) {
      const html = popupTemplate.replace(/\{(\w+)\}/g, (_, key) => {
        const v = feature.get(key);
        return v == null ? '' : String(v);
      });
      popupOverlay.getElement().innerHTML = html;
      popupOverlay.setPosition(evt.coordinate);
    }

    onSelection?.(obj, props.component);
  });
}

// ── main render ─────────────────────────────────────────────────────

async function renderMap(): Promise<void> {
  if (!mapEl.value) return;
  await loadOl();
  disposeMap();

  const c = props.component;
  const crs = (eGet(c, 'crs') as string) || 'EPSG:3857';
  const background = eGet(c, 'background') as string | undefined;
  if (background) mapEl.value.style.background = background;

  // View
  const viewOpts: Record<string, any> = { projection: crs };
  const centerLon = eNum(c, 'centerLon');
  const centerLat = eNum(c, 'centerLat');
  viewOpts.center = (centerLon != null && centerLat != null)
    ? ol.transform([centerLon, centerLat], 'EPSG:4326', crs)
    : ol.transform([0, 0], 'EPSG:4326', crs);
  viewOpts.zoom = eNum(c, 'zoom') ?? 2;
  const minZoom = eNum(c, 'minZoom');
  const maxZoom = eNum(c, 'maxZoom');
  if (minZoom != null) viewOpts.minZoom = minZoom;
  if (maxZoom != null) viewOpts.maxZoom = maxZoom;
  const view = new ol.View(viewOpts);

  // Controls
  const controls = ol.defaultControls({ zoom: eGet(c, 'showZoomControl') !== false });
  if (eGet(c, 'showScaleLine')) controls.push(new ol.ScaleLine());

  // Layers (model order: first = bottom)
  const layerDefs = toList(eGet(c, 'layers'));
  const layers = (await Promise.all(layerDefs.map((l) => buildLayer(l, crs)))).filter(Boolean);

  olMap = new ol.Map({ target: mapEl.value, view, layers, controls });

  // Initial extent overrides center/zoom
  const extent = eGet(c, 'extent') as EObject | undefined;
  if (extent) {
    const e = [
      eGet(extent, 'minLon'), eGet(extent, 'minLat'),
      eGet(extent, 'maxLon'), eGet(extent, 'maxLat'),
    ].map(Number);
    if (e.every(Number.isFinite)) {
      view.fit(ol.transformExtent(e, 'EPSG:4326', crs), { size: olMap.getSize() });
    }
  }

  // Popup overlay
  if (popupEl.value) {
    popupOverlay = new ol.Overlay({
      element: popupEl.value,
      positioning: 'bottom-center',
      offset: [0, -12],
      stopEvent: false,
    });
    olMap.addOverlay(popupOverlay);
  }

  setupInteractions();
}

function disposeMap(): void {
  if (olMap) {
    olMap.setTarget(undefined);
    olMap.dispose?.();
    olMap = null;
  }
  popupOverlay = null;
}

onMounted(() => renderMap());

watch(() => [props.component, props.model], () => renderMap(), { deep: true });

onBeforeUnmount(() => disposeMap());
</script>

<template>
  <div class="uimodel-map-view">
    <div
      ref="mapEl"
      class="uimodel-map-canvas"
      :style="{
        width: (eGet(component, 'width') ? eGet(component, 'width') + 'px' : '100%'),
        height: (eGet(component, 'height') ?? 400) + 'px',
      }"
    />
    <div ref="popupEl" class="uimodel-map-popup" />
  </div>
</template>

<style scoped>
.uimodel-map-view {
  position: relative;
}
.uimodel-map-canvas {
  position: relative;
}
.uimodel-map-popup {
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 13px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  white-space: nowrap;
  pointer-events: none;
}
.uimodel-map-popup:empty {
  display: none;
}
</style>
