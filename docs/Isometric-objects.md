# General-purpose isometric objects

Use these as `kind` values in `IsoScene.objects`:

| Group | Kinds |
| --- | --- |
| Places and nature | `house`, `tree`, `sun`, `weather` |
| Information | `clock`, `chart`, `piechart`, `chatbubble` |
| Achievements and ideas | `trophy`, `flag`, `lightbulb`, `gear` |
| Symbols | `magnifier`, `warning`, `checkmark`, `cross` |
| New roles | `chef`, `worker`, `police` |
| Existing related objects | `cloud`, `factory`, `doctor`, `teacher` |

`chart` grows four bars on entry; `piechart` reveals four sectors. Clock hands and gears rotate automatically. The clock is an accelerated illustration, not wall-clock time. `heartmonitor` has a pulsing trace and scan line; `ambulance` alternates its roof lights. `lightbulb` illuminates when its object or a timed step sets `highlight: true`.

Motion is calculated from scene frames and FPS and does not depend on browser animation timers. Existing object inputs remain valid. Direct `IsoArt` consumers may pass `time` (seconds, default 0) and `highlight` (0–1, default 0).

A link with `"flow": "car"` carries one car along its curve, facing the direction of travel. The car starts once the link is drawn and fades at the endpoints. Other link flows are unchanged.

```json
{
  "objects": [
    {"id": "home", "kind": "house", "at": [0, 0]},
    {"id": "work", "kind": "factory", "at": [8, -8]}
  ],
  "links": [{"from": "home", "to": "work", "flow": "car"}],
  "steps": []
}
```

Common aliases include `home`, `bar-chart`, `pie-chart`, `chat-bubble`, `sun-and-cloud`, `light-bulb`, `cog`, `magnifying-glass`, `warning-sign`, `check-badge`, `cross-badge`, `cook`, `construction-worker`, and `police-officer`.

From `rendering/`:

- `npm run previews:iso` generates SVG sheets and `out/iso-collections/index.html`, a local gallery with play/pause, time scrubbing and a bulb highlight toggle.
- `npm run check:iso` checks registration, aliases, deterministic SVG output, animated states, highlighting and car flow.
- `npm run check:scenes` validates scene contracts and refreshes the planner's `library/registry.json`.
- `npm run validate -- examples/iso-general.json` validates the example covering all additions and car travel.
- `npx remotion render VideoComposition out/iso-general.mp4 --props=examples/iso-general.json` renders the 42-second example.

## Trees and roads

`tree` uses a tapered, branching trunk with bark shading and a layered irregular broadleaf canopy. It retains the same footprint and respects the object color.

| Kind | Layout | Default size |
| --- | --- | --- |
| `singlelane` | One lane with direction arrow, no center divider | `[8, 1.6, 0.12]` |
| `twolane` | One lane per direction, double yellow center | `[8, 3, 0.12]` |
| `fourlane` | Two lanes per direction, white dashed lane dividers | `[9, 4.6, 0.12]` |
| `highway` | Two lanes per direction, shoulders and raised median | `[10, 5.4, 0.18]` |
| `road` | Original generic road with dashed center | `[10, 2.6, 0.12]` |

Roads are ground slabs and render behind vehicles. Their length runs along grid x; `size` adjusts length, width and thickness. Place vehicles at `z: 0.12` (`0.18` on highways) and away from the highway median. `single-lane-road`, `two-lane-road`, `four-lane-road`, `divided-highway`, `motorway` and `freeway` are accepted aliases. These are illustrative markings, not country-specific engineering plans.

`examples/iso-roads.json` demonstrates all four road variants with vehicles and trees. The local preview gallery includes a Trees & road types sheet.

## Communication fundamentals

Seven kinds are available: `envelope`, `sender`, `receiver`, `encoder`, `decoder`, `feedback`, and `noise`. The sender and receiver are communication stations with directional indicators; encoder/decoder show text-to-signal and signal-to-text respectively. Feedback uses return arrows with a travelling marker. Noise has an animated interference waveform. These are conceptual illustrations, not encryption or detailed radio-hardware diagrams.

Aliases: `message-envelope`, `message`, `sender-station`, `receiver-station`, `feedback-loop`, `feedbackloop`, `noise-interference`, and `interference`.

`examples/iso-communication.json` connects sender → encoder → message → decoder → receiver, with a feedback return path and a dashed interference link. The gallery includes all seven objects under Communication fundamentals.


## Print and publishing

Available kinds: `printingpress`, `newspaperbundle`, `magazine`, `printingplates`, `newsstand`, and `deliverystack`. Use these to show printing, publication formats, retail distribution, and delivery. The preview gallery has a Print & publishing sheet.
