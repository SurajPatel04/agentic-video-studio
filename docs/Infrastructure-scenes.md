# Buildings and technology scenes

Run `cd rendering && npm run studio`, then select **InfrastructureDemo**. The 18-second demo shows a city, hardware, and custom sizes. To export:

```sh
cd rendering
npx remotion render InfrastructureDemo out/infrastructure.mp4
```

Use `BuildingScene`, `TechnologyScene`, or `InfrastructureScene` in any composition JSON. Props are optional. Defaults show objects growing from their base, holding, and shrinking/fading away during the final 22 frames. Existing compositions remain available.

```json
{
  "id": "office",
  "component": "InfrastructureScene",
  "durationInFrames": 180,
  "props": {
    "title": "Our office network",
    "objects": [
      {"kind": "building", "size": "large", "height": 1.2, "label": "Office"},
      {"kind": "server", "size": "small", "color": "#b5a0f5", "label": "Server"},
      {"kind": "computer", "scale": 0.9, "label": "Desktop"}
    ]
  }
}
```

| Scene control | Default / meaning |
| --- | --- |
| `preset` | `mixed`; also `city` or `technology` |
| `objects` | Omit for preset objects; `[]` intentionally shows no objects; maximum 12 |
| `scale` | 1; overall size multiplier, 0.25–1.5 |
| `stagger` | 10 frames between entrances |
| `growFrames` | 28 frames for growth |
| `disappear` | true; false keeps objects visible |
| `disappearAt` | Start exit at scene duration minus exit length minus 1 |
| `disappearFrames` | 22 frames |
| `animation` | `grow`, `fade`, or `none` (instant entrance; exit still fades) |
| `showLabels`, `showPlatform` | true |
| `title`, `caption` | Preset text; use empty strings to hide |

Each object supports `kind` (`building`, `server`, `computer`, `laptop`, `router`), `label`, `color`, `size` (`small`, `medium`, `large`), `scale` (0.25–2), `width` and `height` (0.4–1.8). Defaults are medium size and multipliers of 1. Automatic layout limits oversized objects to their slot and the title clearance. `x` and `y` optionally position the bottom center as percentages of the frame; custom positions can overlap, so check your preview. Default y is 76. In the 3D scene, x maps across the camera view and y adjusts elevation; labels stay in their automatic columns.

Override `delay`, `growFrames`, and `disappearAt` on individual objects. All timing is in frames relative to the scene. Keep entrance completion before the exit for a visible hold; very short scenes may overlap entrance and exit. For 30 fps, 30 frames equals one second.

Schemas, description, and tags are exported from `rendering/src/scenes/InfrastructureScene.tsx`. These scenes use procedural Three.js models with glass-like facade panels, metal hardware, lighting, and cast shadows. They require WebGL but no external assets. All animation remains frame-driven. Controls are JSON props, consistent with the brief's first version; there is no separate editor UI.
