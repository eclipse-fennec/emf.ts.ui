# emf.ts.ui

Monorepo für die UIModel-getriebene UI-Komposition auf [EMF.ts](https://github.com/eclipse-fennec/emf.ts).

Statt Oberflächen von Hand zu bauen, wird die UI als **UIModel** (Ecore/XMI)
beschrieben und zur Laufzeit interpretiert — inklusive generischer
Feature-Platzhalter, expression-fähiger Widget-Parameter, Kontrollstrukturen
und eines modellierten, CSS-basierten Styling-Konzepts.

## Pakete

| Paket | npm | Inhalt |
|---|---|---|
| [`packages/uimodel-composer`](packages/uimodel-composer) | `@emfts/uimodel-composer` | Core: UIModel-Metamodell, Vue-Composer, AllFeatures-Expansion, PropertyBindings, strukturelle Platzhalter, CSS-Styling-Modell |
| [`packages/uimodel-vega`](packages/uimodel-vega) | `@emfts/uimodel-vega` | Charts via Vega-Lite (`VegaView`) |
| [`packages/uimodel-maps`](packages/uimodel-maps) | `@emfts/uimodel-maps` | Karten via OpenLayers (`MapView`, QGIS-orientiert) |
| [`packages/uimodel-diagram`](packages/uimodel-diagram) | `@emfts/uimodel-diagram` | Modellgetriebene Diagramme (ELK-Layout, orthogonales Routing) |
| [`packages/tsrouter`](packages/tsrouter) | `@emfts/tsrouter` | Orthogonaler Graph-Router (vom Diagram-Paket genutzt) |

Die Erweiterungen definieren eigene EPackages, die das Core-UIModel **nicht**
verändern (Klassen erben per href von `Component`/`WidgetComponent`), und bringen
ihre Laufzeit-Bibliotheken als Peer-Dependencies mit. Der Core hängt an keiner
davon.

## Apps (nicht publiziert)

| App | Zweck |
|---|---|
| [`apps/editor`](apps/editor) | Editor für UI-Modelle und Styles: Outline-Baum, Live-Preview, reflektives Property-Panel, Undo/Redo, XMI-Speichern |
| [`apps/example`](apps/example) | Demo: Formulare, Tabellen, Master-Detail, Charts, Karten, Diagramme |

## Entwicklung

```bash
npm install            # im Repo-Root (npm workspaces)
npm run build          # alle Pakete und Apps bauen
npm run test:run       # alle Tests
npm run type-check     # nur Typprüfung

npm run dev:editor     # Editor-App starten
npm run dev:example    # Example-App starten
```

Reihenfolge beim Bauen: der Core zuerst — die Erweiterungs-Pakete prüfen gegen
seine `dist`-Typen (`npm run build` im Root erledigt das).

Die generierten TypeScript-Klassen werden **nicht von Hand gepflegt**, sondern
mit `@emfts/codegen` aus den `.ecore`-Modellen erzeugt (`npm run generate`
je Paket). Details im
[Core-README](packages/uimodel-composer/README.md#modell--codegen).

## Lizenz

EPL-2.0
