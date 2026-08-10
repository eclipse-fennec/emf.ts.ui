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
- **Erweiterungen** als separate EPackages, die das Core-UIModel nicht verändern:
  - **Vega** (`http://uimodel/vega/1.0`): Charts via Vega-Lite (`VegaViewComposer`),
    siehe [requirements_vega.md](requirements_vega.md)
  - **Maps** (`http://uimodel/maps/1.0`, QGIS-orientiert): Karten via OpenLayers (`MapViewComposer`)
  - **CSS** (`http://uimodel/css/1.0`): modelliertes, CSS-basiertes Styling
    (Design-Tokens, Themes, benannte Styles, Selektor-Regeln) — siehe unten
- **Editor**: [`editor/`](editor/) — Baum + Live-Preview + reflektives Property-Panel
  für UI-Modelle und Styles, mit Undo/Redo und XMI-Speichern

## Installation

```bash
npm install @emfts/uimodel-composer @emfts/core @emfts/vue-registry vue
```

Für die Erweiterungen zusätzlich: `vega`, `vega-embed`, `vega-lite` (Vega) bzw. `ol` (Maps).

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

**Wichtig bei den Erweiterungen:** `@emfts/uimodel-composer/vega` und
`@emfts/uimodel-composer/maps` erst **nach** der Registrierung des Core-UIModels dynamisch
importieren — deren Package-Initialisierung liest `Component` aus der `EPackageRegistry`.

Ein vollständiges, lauffähiges Setup (XMI-Loading, OCL-Adapter, eigene Widgets) zeigt die
Example-App unter [`example/`](example/).

## Modell & Codegen

Die TypeScript-Klassen unter `src/generated/` werden **nicht von Hand gepflegt**, sondern mit
`@emfts/codegen` aus den Ecore-Modellen unter [`model/`](model/) generiert:

```bash
npm run generate        # Core-UIModel   (model/uimodel.ecore)
npm run generate:vega   # Vega-Extension (model/uimodel-vega.ecore)
npm run generate:maps   # Maps-Extension (model/uimodel-maps.ecore)
npm run generate:css    # CSS-Extension  (model/uimodel-css.ecore)
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

Das CSS-EPackage wird wie vega/maps **nach** dem Core-Package dynamisch importiert:

```ts
const { UimodelCssPackage, UimodelCssFactory } = await import('@emfts/uimodel-composer/css');
```

## Editor-App

[`editor/`](editor/) ist ein web-basierter Editor für UI-Modelle **und** Styles
(orientiert an gene): Outline-Baum über beide Resources, Live-Preview mit
Theme-Umschalter und CSS-Quelltext-Ansicht, reflektives Property-Panel
(Attribute, Enums, Referenzen mit Kandidaten-Auflösung) und ein
Deklarations-Editor für `CssStyle`/`StyleRule`/`CssState` mit
CSS-Property- und `token(…)`-Vorschlägen. Änderungen laufen als Commands
über `@emfts/command` (Undo/Redo, Strg+Z/Y), gespeichert wird als
XMI-Download (Strg+S).

```bash
npm install && npm run build   # Library bauen (editor nutzt file:../)
cd editor
npm install
npm run dev
```

## Example-App

```bash
npm install && npm run build   # Library bauen (example nutzt file:../)
cd example
npm install
npm run dev
```

Die Example-App demonstriert Formulare, Tabellen, Master-Detail, Vega-Charts und
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
