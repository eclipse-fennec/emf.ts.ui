# @emfts/tsrouter

Orthogonaler Graph-Router: berechnet rechtwinklige Kantenpfade zwischen
Knoten-Rechtecken und vermeidet Überlappungen und Kreuzungen. Framework-frei,
ohne Laufzeit-Abhängigkeiten.

Genutzt von [`@emfts/uimodel-diagram`](../uimodel-diagram) für das
Kantenrouting (ELK liefert nur die Knotenpositionen).

```bash
npm install @emfts/tsrouter
```

```ts
import { OrthogonalRouter } from '@emfts/tsrouter';

const router = new OrthogonalRouter();
const result = router.route({ nodes, connections });
// result.paths: [{ connectionId, points: [{x, y}, …] }, …]
```

## Lizenz

EPL-2.0
