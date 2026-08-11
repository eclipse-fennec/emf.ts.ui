# @emfts/uimodel-composer

UIModel-getriebener Vue-3-Composer für [EMF.ts](https://github.com/eclipse-fennec/emf.ts)-Modelle.

Statt UIs von Hand zu bauen, wird die Oberfläche als **UIModel** (Ecore/XMI) beschrieben und zur
Laufzeit interpretiert: Der `UIModelComposer` rendert aus einem geladenen UIModel und einem
Domänen-`EObject` reaktiv die passende Vue-Komponenten-Hierarchie.

## Features

- **View-Typen**: `FormView`, `SectionView`, `TabView`, `TableView`, `SummaryView`, `MasterDetail`
- **Widgets**: Input, TextArea, Number, Checkbox, Date, Combobox, Select, ReferenceLink —
  Rendering über die `@emfts/vue-registry` (eigene Widgets pro EDataType registrierbar)
- **Styles**: kaskadierende Style-Ketten (`BaseStyle`, `LayoutStyle`, `WidgetStyle`, `TableStyle`)
  mit `resolveStyleChain`
- **Expressions**: Sichtbarkeit und Validierung modellgetrieben via JS- oder OCL-Ausdrücken
  (`registerOclEvaluator` für einen OCL-Adapter, z. B. `@emfts/ocl.langium`)
- **Validierung**: `ValidationExpression` + `ValidationMessageMapper` mit Severities
- **CSS-Styling** (`http://uimodel/css/1.0`): modelliertes, CSS-basiertes Styling
  (Design-Tokens, Themes, benannte Styles, Selektor-Regeln) — Teil dieses Pakets,
  siehe unten
- **Erweiterungs-Pakete** (eigene EPackages, verändern das Core-UIModel nicht):
  [`@emfts/uimodel-vega`](../uimodel-vega) (Charts),
  [`@emfts/uimodel-maps`](../uimodel-maps) (Karten, QGIS-orientiert),
  [`@emfts/uimodel-diagram`](../uimodel-diagram) (Diagramme)
- **Editor**: [`apps/editor`](../../apps/editor) — Baum + Live-Preview + reflektives
  Property-Panel für UI-Modelle und Styles, mit Undo/Redo und XMI-Speichern

## Installation

```bash
npm install @emfts/uimodel-composer vue
```

`@emfts/core` und `@emfts/vue-registry` kommen als Dependencies mit; `vue` ist
Peer-Dependency.

Die Renderer für Charts, Karten und Diagramme sind **eigene Pakete** und bringen
ihre Bibliotheken als Peer-Dependencies mit — installiere nur, was du nutzt:

| Erweiterung | Paket | zusätzlich |
|---|---|---|
| Vega-Charts | `@emfts/uimodel-vega` | `vega-embed` |
| Karten (OpenLayers) | `@emfts/uimodel-maps` | `ol` |
| Diagramme (ELK) | `@emfts/uimodel-diagram` | `elkjs` |

Der Core selbst hängt an keiner dieser Bibliotheken.

## Quick Start

```ts
import { createApp } from 'vue';
import { EmftsRendererPlugin, componentRegistry } from '@emfts/vue-registry';
import { registerEcorePackage, EPackageRegistry } from '@emfts/core';
import { UimodelPackage, UimodelFactory } from '@emfts/uimodel-composer';

// 1. Packages registrieren (Ecore-Basis, UIModel, eigene Domänen-Packages)
registerEcorePackage();
const uimodel = UimodelPackage.eINSTANCE;
uimodel.setEFactoryInstance(UimodelFactory.eINSTANCE);
EPackageRegistry.INSTANCE.set(uimodel.getNsURI()!, uimodel);

// 2. UIModel- und Domänen-XMI über ein ResourceSet laden, dann App mounten
const app = createApp(App, { uiModel, model });
app.use(EmftsRendererPlugin, { registry: componentRegistry });
app.mount('#app');
```

```vue
<template>
  <UIModelComposer :ui-model="uiModel" :model="model" />
</template>

<script setup lang="ts">
import { UIModelComposer, type UIModel } from '@emfts/uimodel-composer';
import type { EObject } from '@emfts/core';

defineProps<{ uiModel: UIModel; model: EObject }>();
</script>
```

**Wichtig bei den Erweiterungs-Paketen:** `@emfts/uimodel-vega`,
`@emfts/uimodel-maps` und das CSS-Sub-Entry erst **nach** der Registrierung des
Core-UIModels dynamisch importieren — deren Package-Initialisierung liest
`Component` aus der `EPackageRegistry`. Die Renderer werden der ComposerRegistry
beigesteuert:

```ts
import { VegaViewComposer } from '@emfts/uimodel-vega';
const registry = createComposerRegistry({ ...defaults, VegaView: VegaViewComposer });
```

Ein vollständiges, lauffähiges Setup (XMI-Loading, OCL-Adapter, eigene Widgets) zeigt die
Example-App unter [`apps/example`](../../apps/example).

## Modell & Codegen

Die TypeScript-Klassen unter `src/generated/` werden **nicht von Hand gepflegt**, sondern mit
`@emfts/codegen` aus den Ecore-Modellen unter [`model/`](model/) generiert:

```bash
npm run generate        # Core-UIModel  (model/uimodel.ecore)
npm run generate:css    # CSS-Styling    (model/uimodel-css.ecore)

# Erweiterungs-Pakete generieren aus ihrem eigenen Verzeichnis:
npm run generate --workspace packages/uimodel-vega
npm run generate --workspace packages/uimodel-maps
```

Änderungen am Metamodell immer im `.ecore` vornehmen und anschließend neu generieren.

## AllFeatures — generische Feature-Platzhalter

`AllFeatures extends WidgetComponent` ist ein **Platzhalter in `FormView.fields`**
([#2](https://github.com/eclipse-fennec/emf.ts.ui/issues/2),
[#4](https://github.com/eclipse-fennec/emf.ts.ui/issues/4)): der
`FormViewComposer` expandiert ihn beim Iterieren gegen die EClass des
Domänenobjekts und rendert die Treffer als normale Widgets — ohne eigenes
Markup; Überschriften rendern Konsumenten pro `group` (z. B. über das
gestempelte `data-uim-group`). Die geerbten Widget-Eigenschaften des
Platzhalters (`label`, `readOnly`, `required`, `styles`, `bindings`, …) sind
die Default-Konfiguration jedes Treffers:

- **Auswahl**: `with` (explizite Features, definierte Reihenfolge) *oder*
  Grundmenge (alle Features inkl. geerbte), zugeschnitten durch `eType` und
  `filter` (UND). `filter` ist ein **Meta-Ausdruck** — `self` ist das
  `EStructuralFeature`: `self.derived`, `self.iD === true`,
  `self.eClass().getName() === 'EAttribute'`, `self.name === 'description'`
  (JS; Getter-Konvention `derived` → `isDerived()` übernimmt der Expression-Proxy).
- **Konflikte**: `priority` (höher gewinnt) → Spezifität (`with` > gefiltert) →
  Dokument-Reihenfolge. Jedes Feature landet in höchstens einem Block
  (Dedup pro UIModel); explizit gebundene Widgets gewinnen immer.
- **Template**: `template` referenziert einen `WidgetComponent`-Prototyp **ohne**
  gebundenes `feature` (href in Vorlagen-Dateien möglich). Pro Treffer wird
  geklont, `feature` gebunden und das Label aus dem Feature-Namen abgeleitet.
- **Widget-Wahl als Fallliste** (`cases: TemplateCase[*]`,
  [#5](https://github.com/eclipse-fennec/emf.ts.ui/issues/5)): geordnete
  Fallunterscheidung — `when` ist ein Meta-Ausdruck (fail-closed), erster
  Treffer gewinnt, `widget` referenziert einen Prototyp aus
  `UIModel.templates` (oder per href eine Vorlagen-Datei). `template`
  bleibt als Kurzform „ein Default-Fall ohne when“ (nach den cases geprüft).
  Trifft nichts und es gibt keinen Default-Fall, ist das ein
  **Renderfehler** — ein eingebautes Code-Mapping (`defaultWidgetFor`)
  existiert nicht mehr; das frühere Mapping steht als explizite Fallliste
  im mitgelieferten generischen Default-Modell und ist damit lesbar und
  überschreibbar.
- **Workspace-Overlays** (`UIModelOverlay`,
  [#8](https://github.com/eclipse-fennec/emf.ts.ui/issues/8)):
  Wurzelkonzept ohne Struktur — nur Prototypen-Katalog + `cases`, die
  die Widget-Wahl der Expansion **punktuell übersteuern** (geprüft vor
  den lokalen cases; `priority` reiht mehrere Overlays, explizit
  gebundene Widgets sind nie betroffen). Transport über
  `ExpansionContext.overlayCases` (`collectOverlayCases(overlays)`),
  bequem als `<UIModelComposer :overlays="[…]">`.
- **API**: purer Kern `expandFeatures(eClass, block, context)` +
  `collectExpansionContext(uiModel)`; Expansion im `FormViewComposer`
  (der frühere `AllFeaturesComposer` ist entfernt, #7).
- **required**: wird aus der Multiplizität abgeleitet (`lowerBound >= 1`,
  explizites `required` am Prototyp/Block gewinnt); dabei wird eine
  Required-`ValidationExpression` generiert, sofern der Prototyp keine
  eigenen Validations mitbringt (dokumentierte Konvention, #7).

Kanonisches Beispiel: [`model/templates/generic-default.uimodel.xmi`](model/templates/generic-default.uimodel.xmi)
(ID → Attribute → Referenzen → Derived, klassenunabhängig) — im Editor über die
UIModel-Auswahl der Vorschau live erlebbar.

## PropertyBinding — expression-fähige Widget-Parameter

`WidgetComponent.bindings: PropertyBinding[*]` bindet Widget-Parameter an
Expressions ([Issue #3](https://github.com/eclipse-fennec/emf.ts.ui/issues/3)):

- **Auflösung**: Binding-Ergebnis > statischer Wert am Widget > Ableitung
  (z. B. Label aus dem Feature-Namen). Ausgewertet **reaktiv zur Renderzeit**
  in `useWidgetConfig`/`WidgetComposer`.
- **Kontext**: `self` = Domänenobjekt (wie `visibilityCondition`), zusätzlich
  `feature` (gebundenes `EStructuralFeature`, Meta-Ebene) und `eClass`.
  JS voll unterstützt (`evaluateValue`), OCL auf `self`-Ausdrücke beschränkt.
- **Koersion**: boolesche Parameter → `Boolean(result)`, numerische →
  `Number(result)`, sonst `String(result)`. Sonderfall `property="feature"`:
  Ergebnis muss ein `EStructuralFeature` sein, `null` ⇒ Widget wird nicht
  gerendert. Fail-open: `undefined` ⇒ statischer Wert gilt.
- **Templates**: `UIModel.templates` ist der Katalog für Widget-Prototypen;
  `AllFeatures.template` referenziert dorthin (oder per href in eine
  Vorlagen-Datei). Bindings am Prototyp werden pro Treffer mitgeklont.
- **Geerbte Bindings**: `AllFeatures.bindings` (von `WidgetComponent` geerbt)
  gilt für **jedes** expandierte Widget — auch ohne Template, das Typ-Mapping
  bleibt erhalten (widget-/template-eigene Bindings gewinnen bei gleichem
  `property`). Damit lassen sich Labels generisch aus EAnnotations ziehen:

```xml
<components xsi:type="uimodel:FormView" name="attributes" group="Attributes">
  <fields xsi:type="uimodel:AllFeatures" name="attribute">
    <filter language="JS" body="self.eClass().getName() === 'EAttribute' &amp;&amp; !self.derived"/>
    <bindings property="label">
      <expression language="JS"
          body="feature.getEAnnotation('http://uimodel/1.0')?.getDetails()?.get('label') ?? feature.name"/>
    </bindings>
  </fields>
</components>
```

Die Expansion setzt außerdem `required` aus der Multiplizität
(`lowerBound >= 1`), sofern der Prototyp nichts vorgibt.

## Strukturelle Platzhalter — GroupWidget, Conditional, ForEach

Drei weitere `fields`-Platzhalter
([#6](https://github.com/eclipse-fennec/emf.ts.ui/issues/6)), frei
komponierbar; aufgelöst vom puren Kern `resolveStructure` und gerendert
vom `FieldsRenderer` (kein Markup über das Nötigste hinaus):

- **`GroupWidget`** (`fields` + `layout`): Container-Widget mit
  `uimodel-group uimodel-group--<layout>`-Klassen (Styling beim
  Konsumenten/CSS-Modell). Als Prototyp im `templates`-Katalog ergibt es
  **komplexe Templates** — die ganze Gruppe wird pro Treffer geklont;
  Nachfahren ohne eigenes `feature` erben das expandierte Feature.
- **`Conditional`** (`condition` + `then`/`else`): gruppenfähiges if mit
  else-Zweig; `self` = Domänenobjekt, fail-open wie `visibilityCondition`.
- **`ForEach`** (`items` + `body`, optional `emptyText`): Iterator über
  eine Instanz-Collection — `body` wird pro Element gerendert, `self`/
  `model` ist dort **das Element** (Widget-`feature` referenziert die
  Element-Klasse; Bindings, Validierung und CSS-condition-Regeln wirken
  pro Element).

```xml
<fields xsi:type="uimodel:ForEach" name="colleagues" emptyText="Keine Kollegen.">
  <items language="JS" body="self.company?.employees"/>
  <body xsi:type="uimodel:GroupWidget" name="row" layout="HORIZONTAL">
    <fields xsi:type="uimodel:InputWidget" name="firstName"
        feature="…//Person/firstName" readOnly="true"/>
    <fields xsi:type="uimodel:InputWidget" name="jobTitle"
        feature="…//Person/jobTitle" readOnly="true"/>
  </body>
</fields>
```

## Widget-Extension-Pakete

Eigene Widget-Typen (Code-, Markdown-, RichText-Editoren …) gehören **nicht**
in den uimodel-Kern, sondern in ein eigenes EPackage des Hosts — analog zu
`uimodel-vega.ecore`/`uimodel-maps.ecore`
([#9](https://github.com/eclipse-fennec/emf.ts.ui/issues/9)):

1. **EPackage definieren**: eigener `nsURI` (z. B.
   `http://gene/uimodel/widgets/1.0`), Klassen erweitern
   `http://uimodel/1.0#//WidgetComponent` per href und ergänzen eigene
   Attribute (`language`, `preview`, `toolbarItems`, …). Codegen wie bei den
   anderen Extensions mit `-d model/uimodel.ecore --import-mapping`.
2. **Registrieren**: das Package **nach** dem Core-UIModel dynamisch
   importieren und in die `EPackageRegistry` legen (`_init()` liest
   `WidgetComponent` aus der Registry).
3. **Renderer beisteuern**: über die `@emfts/vue-registry`; die Komponente
   liest Konfiguration aus `custom.resolvedStyle`/`custom.rawWidget`.

Die Kern-Mechanik ist EClass-agnostisch: `cloneComponent` instanziiert über
die Factory des jeweiligen EPackage, TemplateCase-/Overlay-Matching,
PropertyBindings und das CSS-Klassen-Stamping arbeiten reflektiv. Extension-
Widgets brauchen dafür **generierte Impls**, die von den exportierten
Basisklassen (`ComponentImpl`, `WidgetComponentImpl`) erben —
`DynamicEObject`s reichen nicht, weil die Expansion Property-Accessors nutzt.
Verifiziert in [`src/allfeatures/widgetExtension.test.ts`](src/allfeatures/widgetExtension.test.ts)
(Expansion, TemplateCase, UIModelOverlay, Bindings auf Extension-Attributen).

**Fallback**: Liefert die Registry für ein Feature keine Komponente, rendert
der Composer ein `FallbackWidget` (Label + Plaintext-Editor auf dem gebundenen
Feature) und meldet das einmal pro Widget-Klasse per `console.warn` — statt
still leer zu bleiben; Daten gehen dabei nicht verloren.

## Live-Reaktivität (Expression-Tick)

EObjects sind keine Vue-Reactive-Sources — Expression-Ergebnisse
(Bindings, Visibility, Validierung, `Conditional`/`ForEach`,
condition-StyleRules) hängen deshalb am globalen **Expression-Tick**
([#7](https://github.com/eclipse-fennec/emf.ts.ui/issues/7)):

- Der `UIModelComposer` hängt automatisch einen `EContentAdapter` an das
  übergebene Domänenobjekt (`useModelTick`) — Widget-Edits und
  programmatische `eSet`-Aufrufe wirken sofort.
- Für Änderungen, die der Adapter nicht sieht (andere Resources,
  Struktur-Änderungen am UIModel selbst), rufen Konsumenten
  `bumpExpressionTick()`; eigene expression-abhängige computeds lesen
  `trackExpressionTick()`.

## CSS-Styling-Modell (`http://uimodel/css/1.0`)

[`model/uimodel-css.ecore`](model/uimodel-css.ecore) modelliert Styling CSS-nah, aber
vollständig als EMF-Modell (eigene Resource, z. B. `styles.xmi`):

| Konzept | EClass | CSS-Analogon |
|---|---|---|
| `StyleSheet` | Wurzel: tokens, themes, styles, rules | Stylesheet |
| `DesignToken` | `name`/`value` → `--uic-<name>` auf `:root` | Custom Property |
| `Theme` + `TokenOverride` | Token-Overrides, Aktivierung via Klasse `uicss-theme-<name>` | Theme-Scope |
| `CssStyle` (extends `BaseStyle`!) | benannte Klasse `.uic-<name>`, aus `Component.styles` referenzierbar, `extends`-Kaskade | CSS-Klasse |
| `CssDeclaration` | `property`/`value`/`important`; `token(<name>)` → `var(--uic-<name>)` | Deklaration |
| `CssState` | HOVER/FOCUS/ACTIVE/DISABLED/READONLY/INVALID/REQUIRED | Pseudo-Klasse |
| `StyleRule` | Selektor: `targetClass` (± Subtypen), `componentName`, `group`, `condition` (JS/OCL, dynamisch), `priority`, `media` | CSS-Regel |

Die **CSS-Engine** (`generateCss`) übersetzt ein StyleSheet in echtes CSS;
`useStyleSheetInjection` hält es reaktiv (EContentAdapter) als `<style>`-Element aktuell.
Die Composer **stempeln** dafür Klassen und data-Attribute auf jede gerenderte Komponente:

```
.uim-component .uim-c-<EClass … inkl. Supertypen>   → Typ-Selektoren
[data-uim-eclass|name|group]                        → exakte Selektoren
.uic-<name>                                         → referenzierte CssStyles
.uim-s-required|-readonly|…                         → Widget-Zustände
.uicss-cond-<sheet>-<i>                             → erfüllte condition-Regeln
```

Verwendung:

```vue
<UIModelComposer :ui-model="uiModel" :model="model" :style-sheets="[styleSheet]" />
```

Das CSS-EPackage wird wie die Erweiterungs-Pakete **nach** dem Core-Package
dynamisch importiert:

```ts
const { UimodelCssPackage, UimodelCssFactory } = await import('@emfts/uimodel-composer/css');
```

## Editor-App

[`apps/editor`](../../apps/editor) ist ein web-basierter Editor für UI-Modelle **und** Styles
(orientiert an gene): Outline-Baum über beide Resources, Live-Preview mit
Theme-Umschalter und CSS-Quelltext-Ansicht, reflektives Property-Panel
(Attribute, Enums, Referenzen mit Kandidaten-Auflösung) und ein
Deklarations-Editor für `CssStyle`/`StyleRule`/`CssState` mit
CSS-Property- und `token(…)`-Vorschlägen. Änderungen laufen als Commands
über `@emfts/command` (Undo/Redo, Strg+Z/Y), gespeichert wird als
XMI-Download (Strg+S).

```bash
npm install          # im Repo-Root (npm workspaces)
npm run build        # alle Pakete bauen
npm run dev:editor   # Editor starten
```

## Example-App

```bash
npm install          # im Repo-Root
npm run build
npm run dev:example
```

Die Example-App (`apps/example`) demonstriert Formulare, Tabellen, Master-Detail, Vega-Charts und
OpenLayers-Karten auf Basis eigener Domänen-Modelle (`example/model/`).

## Entwicklung

```bash
npm run build        # vue-tsc --noEmit && vite build
npm run type-check   # nur Typprüfung
npm test             # vitest (watch)
npm run test:run     # vitest einmalig
```

## Lizenz

[EPL-2.0](https://www.eclipse.org/legal/epl-2.0/)
