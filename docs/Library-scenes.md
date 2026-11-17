# Expanded scene library

Ten new planner-ready scenes join the registry, which now exports **28 entries** (26 unique components, including the `BuildingScene`/`TechnologyScene` presets and the existing `DeviceGridScene`). Every scene is JSON-only: the planner supplies props and never writes React code.

## Preview the additions

```sh
cd rendering
npm run studio
# Select LibraryShowcase, or:
npx remotion render LibraryShowcase out/library-showcase.mp4
npm run check:visual
```

`LibraryShowcase` is a 53-second, silent demo covering every new component. `check:visual` renders one still per scene into `out/scene-checks/`, including the ten new scenes. Rendered artifacts: `rendering/out/library-showcase.mp4`, `rendering/out/library-additions.png` (contact sheet), and `rendering/out/library-showcase-hero.png`.

## New scenes

| Scene | Use it for | Main controls |
| --- | --- | --- |
| `ChartScene` | Bar, line, or area charts with one to four series | `chartType`, `categories`, `series[]`, `yLabel`, `xLabel`, `valueSuffix`, `maxValue`, `showValues`, `showLegend`, `showGrid` |
| `EquationScene` | Formulas and derivations revealed step by step | `steps[]` (`latex`, `note`, `highlight`), `layout` (`stack`/`focus`), `stagger`, `revealFrames` |
| `TimelineScene` | History, chronology, project milestones | `events[]` (`date`, `title`, `detail`), `orientation` (`horizontal`/`vertical`), `stagger` |
| `FlowchartScene` | Systems, pipelines, decisions, agent flows | `nodes[]` (`id`, `label`, `detail`, `kind`), `edges[]` (`from`, `to`, `label`), `direction` |
| `CodeScene` | Programming lessons and algorithm walkthroughs | `code`, `language`, `filename`, `highlightLines[]`, `lineStagger`, `showLineNumbers`, `fontSize` |
| `MapScene` | Geography, trade routes, network coverage | `highlightCountries[]`, `cities[]` (`name`, `lat`, `lon`), `routes[]` (`from`, `to`), `showLabels`, `showGraticule` |
| `StatScene` | A key number, hook, or comparison | `value`, `prefix`, `suffix`, `decimals`, `label`, `detail`, `comparisons[]`, `accentColor` |
| `ImageScene` | Figures from PDFs, photos, diagrams, screenshots | `src`, `alt`, `caption`, `credit`, `fit` (`cover`/`contain`), `motion` (`pan-left`, `pan-right`, `zoom-in`, `zoom-out`, `none`) |
| `CycleScene` | Repeating processes: water cycle, life cycle, feedback loops | `steps[]` (`label`, `detail`), `centerLabel`, `direction` (`clockwise`/`counterclockwise`), `stagger` |
| `VennScene` | Comparing two ideas and their shared traits | `left`/`right` (`label`, `items[]`), `both[]`, `bothLabel`, `leftColor`, `rightColor` |

The registry also keeps the existing `DeviceGridScene`, a grid of hardware icons that can switch between off, on, active, and error states.

## Planner notes

- All scenes work with `props: {}`. Defaults are complete, realistic examples.
- Props are validated with Zod before rendering. Unknown props fail with the scene ID and field name.
- Every new scene uses the shared `StudyFrame` and theme, so global and per-scene theme overrides work.
- All motion is frame-driven through `useCurrentFrame`; there are no CSS animations, timers, or `requestAnimationFrame` calls.
- `ChartScene` accepts 2–12 categories and 1–4 series. Every series must have exactly one value per category.
- `EquationScene` supports 1–5 steps. `latex` is rendered by KaTeX; `note` is optional plain text.
- `TimelineScene` supports 2–7 events. Use `vertical` when event descriptions are long.
- `FlowchartScene` supports 2–10 nodes and up to 14 edges. `direction` is `horizontal` or `vertical`; dagre handles layout.
- `CodeScene` supports up to 26 lines. `highlightLines` uses 1-based line numbers.
- `MapScene` resolves route endpoints by city name first, then country name. Country aliases include `USA`, `US`, `UK`, `Britain`, `UAE`, and `Korea`.
- `ImageScene` loads local files from `rendering/public/` (pass a relative path) or an HTTPS URL. `<Img>` blocks the render until the image is decoded.
- `StatScene` animates the number with a deterministic count-up; comparison bars are optional.
- `CycleScene` supports 3–8 stages. Use `centerLabel` for the loop's name and keep stage details short.
- `VennScene` supports 1–4 unique items per side and 1–5 shared items. Item text is plain text, not Markdown.

## Examples

The full showcase is in `rendering/examples/library-showcase.json`. Copy any scene object into your own composition and edit its props.

```json
{
  "id": "trend",
  "component": "ChartScene",
  "durationInFrames": 135,
  "props": {
    "title": "Global internet users",
    "chartType": "bar",
    "categories": ["2019", "2020", "2021", "2022", "2023", "2024"],
    "series": [
      {"name": "Internet users", "values": [4.1, 4.6, 4.9, 5.0, 5.2, 5.5], "color": "#38bdf8"}
    ],
    "yLabel": "Billions of people",
    "xLabel": "Year",
    "valueSuffix": "B"
  }
}
```

```json
{
  "id": "route",
  "component": "MapScene",
  "durationInFrames": 135,
  "props": {
    "title": "Three routes. One connected world.",
    "highlightCountries": ["India", "Singapore", "United Kingdom", "United States of America"],
    "cities": [
      {"name": "New Delhi", "lat": 28.6139, "lon": 77.209},
      {"name": "Singapore", "lat": 1.3521, "lon": 103.8198},
      {"name": "London", "lat": 51.5074, "lon": -0.1278},
      {"name": "New York", "lat": 40.7128, "lon": -74.006}
    ],
    "routes": [
      {"from": "New Delhi", "to": "Singapore"},
      {"from": "Singapore", "to": "London"},
      {"from": "London", "to": "New York"}
    ]
  }
}
```

```json
{
  "id": "cycles",
  "component": "CycleScene",
  "durationInFrames": 150,
  "props": {
    "title": "The water cycle",
    "centerLabel": "Water keeps moving",
    "steps": [
      {"label": "Evaporation", "detail": "Heat turns liquid water into vapor."},
      {"label": "Condensation", "detail": "Vapor cools and forms clouds."},
      {"label": "Precipitation", "detail": "Rain, snow, or hail falls."},
      {"label": "Collection", "detail": "Water gathers in rivers, lakes, and oceans."}
    ]
  }
}
```

```json
{
  "id": "venn",
  "component": "VennScene",
  "durationInFrames": 150,
  "props": {
    "title": "Plant cells vs animal cells",
    "left": { "label": "Plant cells", "items": ["Cell wall", "Chloroplasts", "Large vacuole"] },
    "right": { "label": "Animal cells", "items": ["Centrioles", "Small vacuoles", "Flexible shape"] },
    "both": ["Nucleus", "Mitochondria", "Cell membrane", "Cytoplasm"],
    "bothLabel": "Both"
  }
}
```

## Remaining gaps

The library now covers the common study-video formats: text, lists, quotes, comparisons, processes, timelines, quizzes, summaries, charts, equations, code, maps, statistics, images, cycles, Venn diagrams, 3D infrastructure, networks, and a 3D globe. Possible later additions are dedicated 3D subject models (biology, chemistry, physics) and a multi-image gallery. None are required for the planner to build a complete lesson from existing components.
