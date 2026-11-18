# News and journalism animations

Seven JSON-driven scenes use the same shaded isometric artwork and paper stage as the technology scenes. Raised platforms, physical story cards, a dimensional newspaper, an angled delivery road, and a cutaway studio replace the original flat icon layouts. Motion comes from the current frame and scales with each scene’s duration. All scenes accept empty props.

| Scene | Animation | Controls |
| --- | --- | --- |
| `NewsCycleScene` | Event → reporter and microphone → editor’s desk and selection funnel → newspaper or TV → audience reactions. Selected story cards pass through; others are held for checking. | `title`, `event`, `output` (`print` / `broadcast`), `stories` (2–4 `{label, selected}` objects) |
| `FrontPageScene` | Empty newspaper → falling headline → illustrated park photo → text columns → editor enlarges the lead story and shrinks side stories. | `title`, `eyebrow`, `masthead`, `headline`, `photoCaption`, `stories` (2–3 titles), `leadShare` (0.5–0.72) |
| `PrintDeliveryScene` | Rotating press rollers → papers on a conveyor → stacked papers load into a van → van drives along a road → papers arc onto doorsteps. | `title`, `masthead`, `homes` (2–4 street names) |
| `StudioScene` | Anchor and cameras ready → ON AIR turns red → control room selects and cuts cameras → selected image reaches home televisions. | `title`, `eyebrow`, `channel`, `headline`, `anchorName`, `cameraLabels` (two labels), `liveAt`, `switchAt`, `homeAt` |

The front-page photo is a built-in illustration. `photoCaption` changes its caption. Broadcast timing is expressed as fractions of scene duration: `liveAt` 0.1–0.4, `switchAt` 0.45–0.7, `homeAt` 0.72–0.9, so the steps always remain ordered.

Preview in Remotion Studio by selecting **JournalismDemo**. The complete seven-scene example is `rendering/examples/journalism.json`.

```sh
cd rendering
npm run studio
node scripts/validate-composition.mjs examples/journalism.json
node scripts/preview-journalism.mjs
npx remotion render JournalismDemo out/journalism-demo.mp4
```

The preview script renders early, middle and late frames of each scene into `rendering/out/journalism/`. The planner discovers all four through `library/registry.json` and the `teach-media` skill.

## Broadcast additions

- `SignalHomesScene`: expanding tower waves activate house TVs and radios in order. `homes` accepts 2–4 labels.
- `RadioTuningScene`: turning dial, frequency scale and visual static become a clean waveform. Set `station` and `frequency` (88–108 MHz). This scene does not synthesize audio.
- `SatelliteNewsScene`: globe and satellite uplink/downlink between labelled newsrooms. Set `from`, `to` and `delayMs` (1–3000). The timer is illustrative, not measured latency.

The studio uses an anchor behind an isometric desk and dedicated broadcast cameras with handles, projecting lenses, tally lights and three-leg tripods.
