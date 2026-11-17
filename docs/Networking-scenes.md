# Networking and study scene library

All ten scenes in the current build list are implemented and registered. The library has since expanded with ten planner-ready scenes — charts, equations, timelines, flowcharts, code, maps, statistics, images, cycles, and Venn diagrams. See [Expanded scene library](Library-scenes.md). The official Indian map depiction from Survey of India remains the default; no alternative India-view download is needed.

## Preview and render

```sh
cd rendering
npm run studio
# Select NetworkingDemo, NetworkingPriority, or StudyGallery.
npx remotion render NetworkingDemo out/networking-complete.mp4
npx remotion render NetworkingPriority out/networking-priority.mp4
```

- `NetworkingDemo`: a complete **visual**, un-narrated LAN/MAN/WAN sequence: introduction, definition, example, hardware, LAN, MAN, zoom, WAN, packet journey, comparison, steps, quiz, recap.
- `NetworkingPriority`: NetworkScene, ComparisonTableScene, and ZoomOutScene.
- `StudyGallery`: city, packet journey, and the five general teaching scenes.
- `examples/network-{star,bus,ring,mesh}.json`: individual topology examples; pass with `--props`.

## Scene controls

All scenes work with `props: {}`. Timing values are in frames relative to the scene. At 30 fps, 30 frames is one second. Change the JSON props to reuse scenes for other lessons.

| Scene | Main controls | Suggested duration at defaults |
| --- | --- | --- |
| NetworkScene | `topology`: star/bus/ring/mesh; `devices`: 3–8 object kinds; `startAt`, `stagger`, `drawFrames`, `packetFrames`, `title`, `caption` | 150+ frames |
| CityNetworkScene | `buildingCount`: 3–10; `startAt`, `drawFrames` per ring segment, `packetFrames`, `title`, `caption` | 150+ frames |
| ZoomOutScene | `cityAt`, `globeAt`, `transitionFrames`, `title`, `lanLabel`, `manLabel`, `wanLabel` | 330+ frames |
| PacketJourneyScene | `stops`: 2–6 `{label, detail, kind}` objects; `startAt`, `travelFrames`, `holdFrames`, `title` | 300+ frames |
| ComparisonTableScene | `columns`: 2–5; `rows`: 1–7, each matching the column count; `startAt`, `rowStagger`, `revealFrames`, `title`, `footer` | 150+ frames |
| DefinitionScene | `term`, `abbreviation`, `meaning`, `detail`, `revealAt` | 120 frames |
| ExampleCardScene | `title`, `example`, `takeaway`, `kind` | 120 frames |
| StepsScene | `title`, `steps`: 2–6 strings; `startAt`, `stagger` | 150+ frames |
| QuizScene | `question`, exactly four `options`, `correctIndex`: 0–3; `answerAt`, `explanation` | 180+ frames |
| SummaryScene | `title`, `points`: 1–6 strings; `startAt`, `stagger` | 150+ frames |

For a star, device 0 is the central device; the default is a router. Network devices reuse the existing 3D infrastructure models. The bus uses a shared backbone with branch cables; a mesh connects every pair of devices. Moving lights illustrate packet traffic, not a simulation of protocol behavior or real throughput.

The city uses a fibre ring that illuminates segment by segment. ZoomOutScene pulls the same 3D camera away from the room and into the city, then uses a scaled dissolve into the existing satellite globe. It is a conceptual scale transition, not a geographically accurate room-to-Earth terrain renderer.

Keep custom text concise to fit the educational card layouts. StudyFrame uses a 1600×900 design canvas fitted inside the output, including portrait output. Some existing scenes use their own responsive layout.

## Contracts and discovery

`rendering/src/registry.ts` exports `sceneCatalog` with a component, Zod schema, description, and tags for every scene. Each scene module exports its schema and metadata. Scene props are validated before rendering; failures identify the scene ID and field. BuildingScene and TechnologyScene keep their separate presets.

`library/registry.json` contains the machine-readable registry, JSON schemas, source paths, and runnable default examples. Regenerate it after schema changes:

```sh
cd rendering
npm run check:scenes
npm run typecheck
npm run check:visual
```

`check:scenes` verifies all default contracts, alias presets, topology wiring, and representative invalid inputs, then exports the registry. `check:visual` renders stills for the core networking scenes and the ten new components into `out/scene-checks`, covering all topologies, the room/city/globe stages, and both quiz states.

A complete narrated video still needs narration/TTS and audio assembly from the backend pipeline; these changes provide the reusable visuals and demo composition.
