<script setup lang="ts">
import { provide, ref, computed, defineAsyncComponent } from 'vue';
import type { EObject } from '@emfts/core';
import type { UIModel } from '@emfts/uimodel-composer';
import { VegaViewComposer } from '@emfts/uimodel-vega';
import {
  UIModelComposer,
  MapViewComposer,
  createComposerRegistry,
  FormViewComposer,
  SectionViewComposer,
  TabViewComposer,
  SummaryViewComposer,
  MasterDetailComposer,
  MAP_SELECTION_KEY,
} from '@emfts/uimodel-composer';
import 'ol/ol.css';
import PersonTableRenderer from './components/PersonTableRenderer.vue';
import { SELECTED_PERSON_KEY, PERSONS_KEY } from './emf/selectionContext';

const props = defineProps<{
  uiModel: UIModel;
  chartModel: UIModel;
  mapModel: UIModel;
  transitMapModel: UIModel;
  transitNetwork: EObject;
  persons: EObject[];
  dataset: EObject;
  diagramModel: EObject;
  ecoreDomain: EObject;
}>();

// ── kleine EMF-Reflection-Helfer ────────────────────────────────────
function eget(obj: EObject | undefined, name: string): any {
  const f = obj?.eClass?.()?.getEStructuralFeature?.(name);
  return f ? obj!.eGet(f) : undefined;
}
function asList(v: any): EObject[] {
  if (!v) return [];
  return Symbol.iterator in Object(v) ? Array.from(v as Iterable<EObject>) : [v];
}

// Selektion + Personenliste für TableRenderer bereitstellen
const selectedPerson = ref<EObject>(props.persons[0]);
provide(SELECTED_PERSON_KEY, selectedPerson);
provide(PERSONS_KEY, props.persons);

// Diagram plugin — lazy loaded via sub-entry
const DiagramViewComposer = defineAsyncComponent(() =>
  import('@emfts/uimodel-composer/diagram').then(m => m.DiagramViewComposer)
);

// ComposerRegistry mit Plugin-Support
const composerRegistry = createComposerRegistry({
  FormView:          FormViewComposer,
  SectionView:       SectionViewComposer,
  TabView:           TabViewComposer,
  SummaryView:       SummaryViewComposer,
  MasterDetail:      MasterDetailComposer,
  TableViewRenderer: PersonTableRenderer,
  VegaView:          VegaViewComposer,
  MapView:           MapViewComposer,
  DiagramView:       DiagramViewComposer,
});

const model = computed(() => selectedPerson.value);

// ── Verkehrsnetz: Layer-Umschaltung + Klick-Selektion ───────────────
const transitMapView = asList(eget(props.transitMapModel, 'components'))[0];
const transitLayers = asList(eget(transitMapView, 'layers')).map((obj) => ({
  obj,
  name: eget(obj, 'name') as string,
}));
const layerVisible = ref<boolean[]>(transitLayers.map((l) => eget(l.obj, 'visible') !== false));
const mapKey = ref(0); // erzwingt Remount der Karte bei Layer-Umschaltung

function toggleLayer(i: number): void {
  layerVisible.value[i] = !layerVisible.value[i];
  const vf = transitLayers[i].obj.eClass()!.getEStructuralFeature('visible')!;
  transitLayers[i].obj.eSet(vf, layerVisible.value[i]);
  mapKey.value++;
}

// Klick-Selektion: MapViewComposer ruft diesen Handler über MAP_SELECTION_KEY
const selectedFeature = ref<EObject | null>(null);
provide(MAP_SELECTION_KEY, (feature: EObject | undefined) => {
  selectedFeature.value = feature ?? null;
});

const selectedTitle = computed(() => selectedFeature.value?.eClass?.()?.getName?.() ?? '');
const selectedFields = computed<[string, string][]>(() => {
  const o = selectedFeature.value;
  if (!o) return [];
  const ec = o.eClass?.();
  if (!ec) return [];
  const out: [string, string][] = [];
  for (const f of ec.getEAllStructuralFeatures()) {
    const n = f.getName?.();
    if (!n || n === 'boundary' || n === 'geometry') continue; // WKT-Rohstrings ausblenden
    const v = o.eGet(f);
    if (v == null) continue;
    if (typeof v === 'object') {
      if (typeof v.getLiteral === 'function') out.push([n, v.getLiteral()]);
      continue;
    }
    out.push([n, String(v)]);
  }
  return out;
});

// Tab-Steuerung
const activeTab = ref<'form' | 'charts' | 'map' | 'transit' | 'diagram'>('form');
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1>UIModel Composer — Beispiel</h1>
      <p class="subtitle">
        Struktur aus <code>form.xmi</code> + <code>chart.xmi</code> · Daten aus <code>persons.xmi</code> + <code>demographics.xmi</code>
      </p>
      <nav class="tabs">
        <button :class="['tab', { 'tab--active': activeTab === 'form' }]" @click="activeTab = 'form'">
          Personen
        </button>
        <button :class="['tab', { 'tab--active': activeTab === 'charts' }]" @click="activeTab = 'charts'">
          Demografie-Charts
        </button>
        <button :class="['tab', { 'tab--active': activeTab === 'map' }]" @click="activeTab = 'map'">
          Karte
        </button>
        <button :class="['tab', { 'tab--active': activeTab === 'transit' }]" @click="activeTab = 'transit'">
          Verkehrsnetz
        </button>
        <button :class="['tab', { 'tab--active': activeTab === 'diagram' }]" @click="activeTab = 'diagram'">
          Diagramm
        </button>
      </nav>
    </header>

    <!-- Tab: Personen (MasterDetail) -->
    <main v-if="activeTab === 'form'" class="app-main">
      <UIModelComposer
        :ui-model="uiModel"
        :model="model"
        :composer-registry="composerRegistry"
      />
    </main>

    <!-- Tab: Vega Charts -->
    <main v-else-if="activeTab === 'charts'" class="app-main app-main--charts">
      <UIModelComposer
        :ui-model="chartModel"
        :model="dataset"
        :composer-registry="composerRegistry"
      />
    </main>

    <!-- Tab: Karte (OpenLayers, QGIS-orientiert) -->
    <main v-else-if="activeTab === 'map'" class="app-main app-main--charts">
      <UIModelComposer
        :ui-model="mapModel"
        :model="dataset"
        :composer-registry="composerRegistry"
      />
    </main>

    <!-- Tab: Ecore Diagramm -->
    <main v-else-if="activeTab === 'diagram'" class="app-main app-main--diagram">
      <DiagramViewComposer
        :component="diagramModel"
        :model="ecoreDomain"
      />
    </main>

    <!-- Tab: Verkehrsnetz (mehrere Layer, Symbology, Klick-Selektion) -->
    <main v-else class="app-main app-main--transit">
      <div class="transit-map">
        <UIModelComposer
          :key="mapKey"
          :ui-model="transitMapModel"
          :model="transitNetwork"
          :composer-registry="composerRegistry"
        />
      </div>

      <aside class="transit-side">
        <section class="panel">
          <h3 class="panel__title">Layer</h3>
          <label v-for="(layer, i) in transitLayers" :key="i" class="layer-toggle">
            <input type="checkbox" :checked="layerVisible[i]" @change="toggleLayer(i)" />
            <span>{{ layer.name }}</span>
          </label>
        </section>

        <section class="panel">
          <h3 class="panel__title">Auswahl</h3>
          <p v-if="!selectedFeature" class="panel__hint">
            Auf eine Haltestelle oder einen Bezirk klicken …
          </p>
          <div v-else>
            <div class="sel-type">{{ selectedTitle }}</div>
            <dl class="sel-fields">
              <template v-for="[key, val] in selectedFields" :key="key">
                <dt>{{ key }}</dt>
                <dd>{{ val }}</dd>
              </template>
            </dl>
          </div>
        </section>
      </aside>
    </main>
  </div>
</template>

<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, sans-serif; background: #f4f5f7; color: #1a1a2e; }
.app { min-height: 100vh; display: flex; flex-direction: column; }
.app-header { background: #1a1a2e; color: #fff; padding: 1.25rem 2rem; }
.app-header h1 { font-size: 1.3rem; font-weight: 600; }
.subtitle { margin-top: .2rem; font-size: .82rem; color: #aab; }
.subtitle code { background: rgba(255,255,255,.12); padding: .1em .4em; border-radius: 4px; }
.app-main { flex: 1; }
.app-main--diagram { overflow: hidden; height: calc(100vh - 100px); }
.app-main--charts { padding: 2rem 2.5rem; display: flex; flex-direction: column; gap: 2rem; max-width: 900px; }

.tabs { display: flex; gap: .5rem; margin-top: .8rem; }
.tab { background: rgba(255,255,255,.1); color: #ccd; border: none; padding: .4rem 1rem; border-radius: 6px; cursor: pointer; font-size: .85rem; transition: background .15s, color .15s; }
.tab:hover { background: rgba(255,255,255,.2); color: #fff; }
.tab--active { background: #5b5fd6; color: #fff; }

.uimodel-master-detail { display: grid; grid-template-columns: 280px 1fr; min-height: calc(100vh - 100px); }
.uimodel-master { background: #fff; border-right: 1px solid #e0e0e8; }
.uimodel-detail { padding: 2rem 2.5rem; max-width: 640px; }

.uimodel-vega-view { background: #fff; border-radius: 10px; padding: 1.5rem; box-shadow: 0 1px 4px rgba(0,0,0,.08); }

/* Verkehrsnetz-Tab */
.app-main--transit { display: flex; gap: 1.5rem; padding: 2rem 2.5rem; align-items: flex-start; }
.transit-map { flex: 0 0 auto; }
.uimodel-map-view { border-radius: 10px; overflow: hidden; box-shadow: 0 1px 6px rgba(0,0,0,.12); }
.ol-control button { cursor: pointer; }
.transit-side { flex: 1; display: flex; flex-direction: column; gap: 1rem; min-width: 240px; max-width: 340px; }
.panel { background: #fff; border-radius: 10px; padding: 1rem 1.2rem; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
.panel__title { font-size: .8rem; text-transform: uppercase; letter-spacing: .05em; color: #667; margin-bottom: .7rem; }
.panel__hint { font-size: .85rem; color: #99a; font-style: italic; }
.layer-toggle { display: flex; align-items: center; gap: .5rem; padding: .3rem 0; font-size: .9rem; cursor: pointer; }
.layer-toggle input { cursor: pointer; }
.sel-type { display: inline-block; font-size: .72rem; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: #5b5fd6; background: #ececff; padding: .15rem .5rem; border-radius: 4px; margin-bottom: .6rem; }
.sel-fields { display: grid; grid-template-columns: auto 1fr; gap: .25rem .8rem; font-size: .88rem; }
.sel-fields dt { color: #778; }
.sel-fields dd { font-weight: 600; color: #223; text-align: right; }

.person-list { display: flex; flex-direction: column; padding: 1rem .75rem; gap: .35rem; }
.person-item { display: flex; flex-direction: column; gap: .1rem; padding: .6rem .75rem; border: none; border-radius: 8px; background: transparent; cursor: pointer; text-align: left; transition: background .15s; }
.person-item:hover { background: #f0f0fa; }
.person-item--active { background: #e8e8ff; }
.person-item__name { font-size: .9rem; font-weight: 600; }
.person-item__role { font-size: .78rem; color: #778; }

.uimodel-form-view { display: flex; flex-direction: column; gap: 1.1rem; }

.field { display: flex; flex-direction: column; gap: .3rem; }
.field__label { font-size: .75rem; font-weight: 600; color: #556; text-transform: uppercase; letter-spacing: .04em; }
.field__required { color: #d03; }
.field__input { padding: .5rem .75rem; border: 1px solid #ccd; border-radius: 6px; font-size: .95rem; background: #fff; transition: border-color .15s, box-shadow .15s; }
.field__input:focus { outline: none; border-color: #5b5fd6; box-shadow: 0 0 0 3px rgba(91,95,214,.15); }
.field--required .field__input { border-left: 3px solid #5b5fd6; }
.field--readonly .field__input { background: #f8f8fa; color: #888; }
</style>
