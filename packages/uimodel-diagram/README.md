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
const registry = createComposerRegistry({ ...defaults, DiagramView: DiagramViewComposer });
```

Alternativ als tsm-Plugin: das Paket exportiert `activate`/`deactivate` und ein
`manifest.json` (`@eclipse-daanse/tsm` als optionaler Peer).

Eigenschaften: reaktives Layout über einen `EContentAdapter` (strukturelle
Änderungen lösen ein Re-Layout aus, reine Attributänderungen nur ein Re-Render),
Pin-Overlay für manuell verschobene Knoten, Pan/Zoom.

## Lizenz

EPL-2.0
