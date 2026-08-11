# Requirements: UIModel Vega Extension

## Ziel

Erweiterung des UIModels um eine Visualisierungskomponente auf Basis von Vega-Lite.
Die Erweiterung ist ein separates EPackage (`http://uimodel/vega/1.0`) und baut auf dem
Core-UIModel (`http://uimodel/1.0`) auf, ohne diesen zu verändern.

---

## Architektur

- Eigenes Ecore: `model/uimodel-vega.ecore`
- Eigene Codegen-Config: `model/uimodel-vega.genconfig.xmi`
- Eigene generierte Klassen: `src/generated/uimodel-vega/`
- Eigene Vue-Komponenten: `src/vega/`
- Spätere Auslagerung als `@emfts/uimodel-vega-composer` möglich

---

## Modell

### `VegaView extends Component`

Neue Component-Unterklasse. Registriert sich wie alle anderen Components im ComponentDispatcher.

| Feature | Typ | Beschreibung |
|---|---|---|
| `dataSource` | `VegaDataSource` (containment, 1) | Datenquelle aus dem EMF-Modell |
| `marks` | `VegaMark[]` (containment) | Diagrammtyp und Encoding (model-driven) |
| `signals` | `VegaSignalBinding[]` (containment) | Vega-Signals → EMF-Feature zurückschreiben |
| `width` | `EInt` | Breite in Pixel (0 = responsive) |
| `height` | `EInt` | Höhe in Pixel |
| `spec` | `EString` | Statische Vega-Lite-JSON-Spec (Escape-Hatch) |
| `specExpression` | `Expression` (containment) | Dynamische Spec via JS/OCL, Kontext: EObject |

`specExpression` hat Vorrang vor `spec`. Beide haben Vorrang vor `marks`.

---

### `VegaDataSource`

Bindet eine many-valued EStructuralFeature des aktuellen EObjects als Datenquelle.

| Feature | Typ | Beschreibung |
|---|---|---|
| `feature` | `EStructuralFeature` (1) | Many-valued Feature (z.B. `Person.orders`) |
| `filterExpression` | `Expression` (containment) | Optionaler Filter auf der Collection |
| `transforms` | `VegaTransform[]` (containment) | Strukturelle Datentransformationen (Fold, Aggregate) |
| `transformExpression` | `Expression` (containment) | Escape-Hatch: JS-Expression die EList → Array mapped |

`transformExpression` hat Vorrang über `transforms`.

---

### `VegaTransform` (abstract)

Deklarative Datentransformation für Standardfälle.

**`VegaFoldTransform`** — wandelt Wide-Format in Long-Format (mehrere Felder → Series)

| Feature | Typ | Beschreibung |
|---|---|---|
| `fields` | `EString[]` | Feature-Namen die gefaltet werden |
| `as` | `EString[]` | Ziel-Feldnamen (key, value) — default: `["key", "value"]` |

**`VegaAggregateTransform`** — gruppiert und aggregiert

| Feature | Typ | Beschreibung |
|---|---|---|
| `groupBy` | `EStructuralFeature` | Gruppierungsfeld |
| `op` | `VegaAggregate` | Aggregationsfunktion |
| `field` | `EStructuralFeature` | Aggregiertes Feld |
| `as` | `EString` | Name des Ergebnis-Felds |

---

### `VegaMark` (abstract)

Beschreibt den Diagrammtyp und das Encoding der Achsen/Kanäle.

| Feature | Typ | Beschreibung |
|---|---|---|
| `x` | `VegaEncoding` (containment, 1) | X-Achse / horizontaler Kanal |
| `y` | `VegaEncoding` (containment) | Y-Achse / vertikaler Kanal |
| `color` | `VegaEncoding` (containment) | Farbkanal |
| `size` | `VegaEncoding` (containment) | Größenkanal |
| `tooltip` | `EBoolean` | Tooltip aktivieren |

**Subklassen:**

| Klasse | Besonderheiten |
|---|---|
| `VegaBarMark` | `orientation: VegaOrientation` (HORIZONTAL \| VERTICAL) |
| `VegaLineMark` | `point: EBoolean` (Datenpunkte anzeigen) |
| `VegaPointMark` | Scatterplot |
| `VegaArcMark` | Pie/Donut — `innerRadius: EInt` (0 = Pie, >0 = Donut) |
| `VegaAreaMark` | Flächendiagramm |

---

### `VegaEncoding`

Beschreibt wie ein EStructuralFeature auf einen Vega-Kanal gemappt wird.

| Feature | Typ | Beschreibung |
|---|---|---|
| `feature` | `EStructuralFeature` | Direkte Feature-Bindung |
| `expression` | `Expression` (containment) | Alternativ zu `feature`, wenn kein direktes Feature passt |
| `aggregate` | `VegaAggregate` | Aggregationsfunktion |
| `fieldType` | `VegaFieldType` | Datentyp für Vega |
| `title` | `EString` | Achsen-/Kanalbeschriftung |
| `format` | `EString` | Zahlen- oder Datumsformat (Vega-Format-String) |

`expression` hat Vorrang über `feature`.

---

### `VegaSignalBinding`

Schreibt Vega-Signal-Werte (z.B. Selektion) zurück in ein EMF-Feature.

| Feature | Typ | Beschreibung |
|---|---|---|
| `signalName` | `EString` (1) | Name des Vega-Signals |
| `targetFeature` | `EStructuralFeature` | Ziel-Feature am aktuellen EObject |
| `transform` | `Expression` (containment) | Optionale Werttransformation vor dem Schreiben |

---

## Enums

| Enum | Literale |
|---|---|
| `VegaAggregate` | `NONE`, `COUNT`, `SUM`, `MEAN`, `MIN`, `MAX`, `MEDIAN` |
| `VegaFieldType` | `QUANTITATIVE`, `ORDINAL`, `NOMINAL`, `TEMPORAL` |
| `VegaOrientation` | `HORIZONTAL`, `VERTICAL` |

---

## Laufzeit (Composer)

`VegaViewComposer.vue` übernimmt folgende Schritte:

1. `dataSource.feature` am aktuellen EObject auflesen → EList von EObjects
2. Optional `filterExpression` auswerten → gefilterte Liste
3. EObjects via `VegaEncoding` auf plain JS-Objekte mappen (Vega-Data-Records)
4. Aus `marks[]` eine Vega-Lite-Spec aufbauen — **oder** `specExpression` / `spec` direkt verwenden
5. Spec via `vegaEmbed()` rendern
6. Vega-Signals abonnieren → Werte via `eSet()` in das EObject zurückschreiben

---

## Paketstruktur (nsURI)

- Core UIModel: `http://uimodel/1.0`
- Vega Extension: `http://uimodel/vega/1.0`

Cross-Referenzen auf den Core immer via nsURI, nicht via Dateipfad:
```xml
<eSuperTypes href="http://uimodel/1.0#//Component"/>
```

---

## Entschiedene Designfragen

| Frage | Entscheidung |
|---|---|
| VegaTransform-Klassen oder nur Expression? | Beides: `VegaTransform`-Subklassen für Standardfälle + `transformExpression` als Escape-Hatch |
| `VegaView` als Master in `MasterDetail`? | Ja — erfordert `MasterDetail.master: Component` statt `TableView` |
| `vega-embed` gebündelt oder peerDependency? | peerDependency — Nutzer installiert selbst, verhindert Doppelbündelung |

## Abhängigkeiten zum Core-UIModel

- `MasterDetail.master` muss von `TableView` auf `Component` geändert werden
