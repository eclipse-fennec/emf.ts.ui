# @emfts/uimodel-diagram

Modellgetriebene Diagramme für [`@emfts/uimodel-composer`](../uimodel-composer):
ein DiagramModel (NodeMapping/Compartment/EdgeMapping) wird interpretiert, per
[elkjs](https://github.com/kieler/elkjs) gelayoutet und als SVG gerendert —
Kanten orthogonal geroutet über [`@emfts/tsrouter`](../tsrouter).

```bash
npm install @emfts/uimodel-diagram @emfts/uimodel-composer elkjs vue
```

## Verwendung

```ts
import { DiagramViewComposer } from '@emfts/uimodel-diagram';
import '@emfts/uimodel-diagram/style.css';
const registry = createComposerRegistry({ ...defaults, DiagramView: DiagramViewComposer });
```

Das EPackage (`http://uimodel/diagram/1.0`) wird wie die übrigen Erweiterungen
**nach** dem Core-UIModel registriert — `DiagramView` erbt von `Component`,
die Ausdrücke von `Expression`:

```ts
const { UimodelDiagramPackage, UimodelDiagramFactory } = await import('@emfts/uimodel-diagram');
const pkg = UimodelDiagramPackage.eINSTANCE;
pkg.setEFactoryInstance(UimodelDiagramFactory.eINSTANCE);
EPackageRegistry.INSTANCE.set(pkg.getNsURI()!, pkg);
```

Alternativ als tsm-Plugin: das Paket exportiert `activate`/`deactivate` und ein
`manifest.json` (`@eclipse-daanse/tsm` als optionaler Peer).

Eigenschaften: reaktives Layout über einen `EContentAdapter` (strukturelle
Änderungen lösen ein Re-Layout aus, reine Attributänderungen nur ein Re-Render),
Pin-Overlay für manuell verschobene Knoten, Pan/Zoom, Einpassen nach jedem
Layout.

## Zwei Arten von Knoten

Ein Knoten **ohne** Renderer ist ein Kasten mit Kopfzeile und Zeilen — das
Klassendiagramm, wie es war. Erklärt ein `NodeRenderer` eine andere Form als
`COMPARTMENTS`, wird daraus ein **Symbolknoten** fester Größe mit Beschriftung
daneben: Raute, Achteck, Ellipse, gekapptes Rechteck und so fort.

```xml
<nodes name="devices" from="…#//Network/devices" labelFeature="…#//Device/name">
  <renderer xsi:type="uidiagram:CategorizedNodeRenderer" classFeature="…#//Device/kind">
    <categories value="ROUTER"><symbol shape="DIAMOND" width="40"/></categories>
    <categories value="FIREWALL"><symbol shape="OCTAGON" width="36"/></categories>
    <fallback shape="ELLIPSE" width="16"/>
    <!-- Overlays legen sich über die Form, ohne sie zu ersetzen -->
    <overlays label="Nicht erreichbar">
      <filter language="JS" body="self.health === 'DOWN'"/>
      <symbol strokeColor="#dc2626" strokeWidth="4"/>
    </overlays>
  </renderer>
</nodes>
```

Die Symbologie folgt [`@emfts/uimodel-maps`](../uimodel-maps):
`SingleNodeRenderer`, `CategorizedNodeRenderer` (ein Symbol je Feature-Wert) und
`RuleBasedNodeRenderer` (erste zutreffende Regel). `NodeRenderer.overlays` gilt
für alle drei — die Kategorie bestimmt die Form, das Overlay den Zustand, und
ein Overlay überschreibt nur, was es selbst setzt. Kanten tragen dieselben drei
Renderer mit `EdgeSymbol` (Farbe, Breite, Strichart).

## Rahmen, die nicht aus dem Containment kommen

`NodeMapping.children` schachtelt Knoten entlang des Containments. Manche
Gruppierung steht aber nicht im Modellbaum: Ein Gerät trägt den **Pfad** seines
Standorts als Zeichenkette, und die Orte bilden über ihren Elternpfad einen
eigenen Baum. Dafür gibt es `NodeGrouping`:

```xml
<groupings xmi:id="g-site" name="site"
    keyFeature="…#//Device/location"        <!-- Schlüssel am Knoten -->
    from="…#//Network/sites"                <!-- die Gruppenobjekte -->
    identityFeature="…#//Site/path"         <!-- ihr Schlüssel -->
    labelFeature="…#//Site/name"
    parentFeature="…#//Site/parent"/>       <!-- der Rahmen darum -->
```

`NodeMapping.groupings` ist geordnet: Die erste Gruppierung, die für ein Objekt
einen Schlüssel liefert, gewinnt — erst das Rack, sonst der Standort. Ein Rahmen
entsteht nur, wenn ein Knoten in ihn fällt, samt der Rahmen darum; leere
zeichnet niemand. `keyPath` führt zum Schlüsselträger, wenn er nicht am Knoten
selbst sitzt (`[Device.mount, Mount.rack]`), und `parentGrouping` sagt, in
welcher Gruppierung ein Elternschlüssel nachzuschlagen ist. Ein Zyklus in
`parentFeature` bricht ab, statt endlos zu laufen.

## Auswahl

Ein Klick schreibt die `DiagramSelectionBinding`s des `DiagramView` ins Modell
und meldet sich bei einem Vorfahren — dasselbe Muster wie `MapSelectionBinding`:

```ts
import { DIAGRAM_SELECTION_KEY } from '@emfts/uimodel-diagram';
provide(DIAGRAM_SELECTION_KEY, (node) => { selected.value = node ?? null });
```

## Beispiele

`apps/example` zeigt beides: das **Ecore-Klassendiagramm** (Kastenknoten,
Compartments, Vererbung, Gruppen für Datentypen und Enums) und den **Netzplan**
(Symbolknoten je Geräteart, Standort- und Rack-Rahmen, Trunk-Kanten,
Betriebslage als Overlay) — `public/netzplan-diagram.xmi`, projiziert auf
`public/netzplan.xmi`.

## Lizenz

EPL-2.0
