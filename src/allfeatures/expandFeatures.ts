/**
 * AllFeatures-Expansion (Issue #2): purer Kern ohne Vue-Abhängigkeit.
 *
 * Semantik:
 *   1. Grundmenge = alle Features der EClass (inkl. geerbte) in
 *      Feature-Reihenfolge.
 *   2. `with` gesetzt → genau diese Features in with-Reihenfolge
 *      (stilles Leer-Matchen für klassenfremde Features, O4);
 *      sonst schneiden `eType` und `filter` die Grundmenge zu (UND).
 *      `filter` ist ein Meta-Ausdruck: self = EStructuralFeature.
 *   3. Konflikt zwischen Blöcken: priority (höher gewinnt) → Spezifität
 *      (`with` > gefiltert) → Dokument-Reihenfolge. Explizit gebundene
 *      Widgets gewinnen immer. Dedup pro UIModel (O3).
 *   4. Pro Treffer: template-Klon mit gebundenem feature, sonst
 *      eingebautes Typ-Mapping. Keine Platzhalter-Substitution in
 *      Prototyp-Validations (O2).
 */
import type { EClass, EObject, EReference, EStructuralFeature } from '@emfts/core';
import type { AllFeatures } from '../generated/AllFeatures';
import type { WidgetComponent } from '../generated/WidgetComponent';
import { evaluateBoolean, evaluateValue } from '../utils/evaluateExpression';
import { eNum } from '../css/cssEngine';

/** Dedup-Scope: alle Blöcke + explizit gebundene Features eines UIModels. */
export interface ExpansionContext {
  /** AllFeatures-Blöcke in Dokument-Reihenfolge. */
  blocks: AllFeatures[];
  /** Features, die bereits von explizit autorierten Widgets gebunden sind. */
  boundFeatures: Set<EStructuralFeature>;
}

export function isAllFeatures(obj: EObject): obj is AllFeatures {
  return obj.eClass?.()?.getName?.() === 'AllFeatures';
}

function isWidgetComponent(obj: EObject): obj is WidgetComponent {
  const eClass = obj.eClass?.();
  if (!eClass) return false;
  return (
    eClass.getName() === 'WidgetComponent' ||
    eClass.getEAllSuperTypes().some((s) => s.getName() === 'WidgetComponent')
  );
}

function isReference(feature: EStructuralFeature): feature is EReference {
  return typeof (feature as EReference).isContainment === 'function';
}

/**
 * Sammelt Blöcke und gebundene Features aus einem UIModel
 * (Traversierung über alle Containments, Dokument-Reihenfolge).
 */
export function collectExpansionContext(root: EObject): ExpansionContext {
  const blocks: AllFeatures[] = [];
  const boundFeatures = new Set<EStructuralFeature>();

  function visit(obj: EObject): void {
    if (isAllFeatures(obj)) blocks.push(obj);
    // AllFeatures erbt jetzt von WidgetComponent — Platzhalter zählen
    // nicht als explizit gebundene Widgets
    else if (isWidgetComponent(obj) && obj.feature) boundFeatures.add(obj.feature);
    for (const feature of obj.eClass().getEAllStructuralFeatures()) {
      if (!isReference(feature) || !feature.isContainment()) continue;
      const value = obj.eGet(feature);
      if (!value) continue;
      const children = feature.isMany()
        ? [...(value as Iterable<EObject>)]
        : [value as EObject];
      for (const child of children) visit(child);
    }
  }

  visit(root);
  return { blocks, boundFeatures };
}

/** true, wenn der Block explizit über `with` selektiert (höhere Spezifität). */
function isExplicit(block: AllFeatures): boolean {
  return (block.with?.length ?? 0) > 0;
}

/** Kandidaten eines Blocks für eine EClass (ohne Konfliktauflösung). */
export function candidateFeatures(eClass: EClass, block: AllFeatures): EStructuralFeature[] {
  const all = eClass.getEAllStructuralFeatures();
  if (isExplicit(block)) {
    // O4: stilles Leer-Matchen — nur Features, die die Klasse wirklich hat
    const allSet = new Set(all);
    return block.with.filter((f) => allSet.has(f));
  }
  let features = all;
  if ((block.eType?.length ?? 0) > 0) {
    const types = new Set(block.eType);
    features = features.filter((f) => {
      const t = f.getEType();
      return t != null && types.has(t);
    });
  }
  if (block.filter) {
    // Meta-Ebene: self = EStructuralFeature. Achtung fail-open:
    // ohne registrierten OCL-Evaluator matcht ein OCL-Filter alles.
    features = features.filter((f) =>
      evaluateBoolean(block.filter, f as unknown as EObject)
    );
  }
  return features;
}

/**
 * Weist jedem Block seine Features zu: priority ↓ → Spezifität
 * (`with` > gefiltert) → Dokument-Reihenfolge; jedes Feature landet in
 * höchstens einem Block, explizit gebundene Widgets sind ausgenommen.
 */
export function assignFeatures(
  eClass: EClass,
  context: ExpansionContext
): Map<AllFeatures, EStructuralFeature[]> {
  const result = new Map<AllFeatures, EStructuralFeature[]>();
  const candidates = new Map<AllFeatures, Set<EStructuralFeature>>();
  for (const block of context.blocks) {
    result.set(block, []);
    candidates.set(block, new Set(candidateFeatures(eClass, block)));
  }

  const docOrder = new Map<AllFeatures, number>(
    context.blocks.map((b, i) => [b, i])
  );

  for (const feature of eClass.getEAllStructuralFeatures()) {
    if (context.boundFeatures.has(feature)) continue;
    let winner: AllFeatures | undefined;
    for (const block of context.blocks) {
      if (!candidates.get(block)!.has(feature)) continue;
      if (!winner) {
        winner = block;
        continue;
      }
      const byPriority = eNum(block.priority) - eNum(winner.priority);
      const bySpecificity =
        Number(isExplicit(block)) - Number(isExplicit(winner));
      const byDocOrder = docOrder.get(winner)! - docOrder.get(block)!;
      if (byPriority > 0 || (byPriority === 0 && (bySpecificity > 0 || (bySpecificity === 0 && byDocOrder > 0)))) {
        winner = block;
      }
    }
    if (winner) result.get(winner)!.push(feature);
  }

  // with-Blöcke behalten die with-Reihenfolge
  for (const [block, features] of result) {
    if (!isExplicit(block)) continue;
    const order = new Map(block.with.map((f, i) => [f, i]));
    features.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  }

  return result;
}

/**
 * Widget-Wahl als geordnete Fallunterscheidung (Issue #5): erster
 * treffender Case gewinnt; `when` ist ein Meta-Ausdruck
 * (self = EStructuralFeature) und FAIL-CLOSED — Fehler/undefined ⇒ kein
 * Treffer. Fehlt `when`, ist es der Default-Fall. `template` bleibt als
 * Kurzform (T1) und wird NACH den cases geprüft. Kein Treffer ⇒
 * undefined — der Aufrufer meldet den Fehler; ein eingebautes
 * Code-Mapping (defaultWidgetFor) gibt es nicht mehr.
 */
export function widgetPrototypeFor(
  block: AllFeatures,
  feature: EStructuralFeature
): WidgetComponent | undefined {
  for (const templateCase of block.cases ?? []) {
    if (!templateCase.widget) continue;
    if (!templateCase.when) return templateCase.widget;
    const result = evaluateValue(
      templateCase.when,
      feature as unknown as EObject
    );
    if (result) return templateCase.widget;
  }
  return block.template;
}

/**
 * Flacher Struktur-Klon eines Widget-Prototyps: Attribute + Referenzen
 * (gleiche Ziele, z. B. styles) werden übernommen, Containments rekursiv
 * geklont. EcoreUtil.copy reicht nicht (kopiert nur Attribute).
 */
export function cloneComponent<T extends EObject>(source: T): T {
  const eClass = source.eClass();
  const factory = eClass.getEPackage()?.getEFactoryInstance();
  if (!factory) throw new Error(`Keine Factory für ${eClass.getName()}`);
  const copy = factory.create(eClass) as T;
  for (const feature of eClass.getEAllStructuralFeatures()) {
    if (feature.isDerived?.() || feature.isChangeable?.() === false) continue;
    const value = source.eGet(feature);
    if (value === undefined || value === null) continue;
    const containment = isReference(feature) && feature.isContainment();
    if (feature.isMany()) {
      const items = [...(value as Iterable<unknown>)];
      if (items.length === 0) continue;
      copy.eSet(
        feature,
        containment ? items.map((v) => cloneComponent(v as EObject)) : items
      );
    } else {
      copy.eSet(feature, containment ? cloneComponent(value as EObject) : value);
    }
  }
  return copy;
}

// Lokale Namens-Checks statt Imports aus resolveStructure (Zyklus-frei).
const STRUCTURAL_ECLASSES = new Set(['AllFeatures', 'Conditional', 'ForEach']);

function eclassNameOf(obj: EObject): string {
  return obj.eClass?.()?.getName?.() ?? '';
}

/**
 * Bindet das expandierte Feature an den Template-Klon. Bei GroupWidget-
 * Prototypen (komplexe Templates, Issue #6) erben alle Nachfahren-Widgets
 * ohne eigenes feature und ohne feature-Binding das Feature; strukturelle
 * Platzhalter bleiben unangetastet.
 */
function bindFeatureDeep(widget: WidgetComponent, feature: EStructuralFeature): void {
  if (eclassNameOf(widget) !== 'GroupWidget') {
    widget.feature = feature;
    return;
  }
  const fields = (widget as unknown as { fields?: WidgetComponent[] }).fields ?? [];
  for (const child of fields) {
    if (STRUCTURAL_ECLASSES.has(eclassNameOf(child))) continue;
    if (eclassNameOf(child) === 'GroupWidget') {
      bindFeatureDeep(child, feature);
    } else if (!child.feature && !(child.bindings ?? []).some((b) => b.property === 'feature')) {
      child.feature = feature;
    }
  }
}

/** Label-Ableitung aus dem Feature-Namen: "firstName" → "First Name". */
export function deriveLabel(featureName: string): string {
  const spaced = featureName
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Expandiert einen AllFeatures-Block gegen eine EClass zu gebundenen
 * WidgetComponents. Ohne context wird der Block isoliert expandiert.
 */
export function expandFeatures(
  eClass: EClass,
  block: AllFeatures,
  context?: ExpansionContext
): WidgetComponent[] {
  const ctx: ExpansionContext = context ?? {
    blocks: [block],
    boundFeatures: new Set(),
  };
  if (!ctx.blocks.includes(block)) ctx.blocks.push(block);
  const assigned = assignFeatures(eClass, ctx).get(block) ?? [];

  const widgets: WidgetComponent[] = [];
  for (const feature of assigned) {
    const prototype = widgetPrototypeFor(block, feature);
    if (!prototype) {
      // Explizit statt stillem Code-Default (Issue #5): kein Case trifft
      // und kein template gesetzt ⇒ Renderfehler, Feature wird übersprungen.
      console.error(
        `[uimodel-composer] AllFeatures "${block.name ?? '?'}": kein TemplateCase trifft ` +
          `auf Feature "${feature.getName() ?? '?'}" und kein Default-Fall (template) gesetzt.`
      );
      continue;
    }
    const widget = cloneComponent(prototype);
    bindFeatureDeep(widget, feature);
    const featureName = feature.getName() ?? 'feature';
    widget.name = featureName;
    // Geerbte Widget-Eigenschaften des Blocks (AllFeatures extends
    // WidgetComponent, Issue #4) sind die Default-Konfiguration jedes
    // Treffers; template-/widget-eigene Werte gewinnen.
    if (widget.label === undefined && block.label !== undefined) widget.label = block.label;
    if (widget.placeholder === undefined && block.placeholder !== undefined) widget.placeholder = block.placeholder;
    if (widget.readOnly === undefined && block.readOnly !== undefined) widget.readOnly = block.readOnly;
    if (widget.required === undefined && block.required !== undefined) widget.required = block.required;
    if ((widget.styles?.length ?? 0) === 0 && (block.styles?.length ?? 0) > 0) {
      widget.styles = [...block.styles];
    }
    if (!widget.label) widget.label = deriveLabel(featureName);
    if (!widget.group && block.group) widget.group = block.group;
    // required aus der Multiplizität ableiten (lowerBound >= 1),
    // sofern der Prototyp nichts vorgibt (Issue #3, Randnotiz)
    if (widget.required === undefined && eNum(feature.getLowerBound?.()) >= 1) {
      widget.required = true;
    }
    // Block-Level-Bindings auf jedes erzeugte Widget kopieren —
    // unabhängig vom Erzeugungspfad (Template-Klon oder Typ-Mapping);
    // widget-/template-eigene Bindings gewinnen bei gleichem property.
    const blockBindings = block.bindings ?? [];
    if (blockBindings.length > 0) {
      const own = new Set((widget.bindings ?? []).map((b) => b.property));
      const inherited = blockBindings
        .filter((b) => b.property && !own.has(b.property))
        .map((b) => cloneComponent(b));
      if (inherited.length > 0) {
        widget.bindings = [...(widget.bindings ?? []), ...inherited];
      }
    }
    widgets.push(widget);
  }
  return widgets;
}
