# Race, dashboard, and map tracking

These scenes use the existing paper background and scale to the composition size. Every animation is driven by Remotion frames and stretches with its scene duration. All three are registered in the scene catalog and available to the backend planner.

Open **ActivityAnimationsDemo** in Remotion Studio to preview all three. The runnable composition is [activity-animations.json](../rendering/examples/activity-animations.json).

| Scene | Controls | Behavior |
| --- | --- | --- |
| `RaceScene` | Exactly two `lanes`: `{label, seconds, color?}` | Both start together. Stopwatches stop at the supplied completion times; progress follows the same timing. The fastest gets a checkmark; equal times show a tie. |
| `LiveDashboardScene` | `server`, `baselineMs`, `peakMs`, `requestsPerSecond`, `failureAt`, `recoveryAt` | Rolling latency and throughput graphs respond to server failure and recovery, with live numbers and status. |
| `MapTrackingScene` | `origin`, `destination`, `courier`, `etaSeconds`, `route` | Delivery dot follows the route with a colored trail, arrival countdown, progress, and delivered confirmation. |

All scenes accept `title` (up to 70 characters) and `eyebrow` (up to 40). Omitted props produce the examples requested: no cache versus cache, a failed and recovered API server, and a delivery route.

Dashboard event times are fractions of the scene, defaulting to `0.32` and `0.66`. Recovery must follow failure by more than `0.08`; peak latency must exceed baseline. Metrics are simulated for illustration.

Map routes contain 2–20 normalized `[x, y]` points, each coordinate from 0 to 1. At least two positions must differ. The dot travels at constant distance per frame along the drawn route. `etaSeconds` is the trip's illustrative duration, compressed to fit the video. The map is schematic.

Race time is also compressed to fit: an eight-second lane takes four times as long as a two-second lane regardless of the scene length. All scenes hold their final state before ending.

```sh
cd rendering
npm run typecheck
npm run check:scenes
npm run validate -- examples/activity-animations.json
node scripts/preview-activity.mjs
npx remotion render ActivityAnimationsDemo out/activity-animations.mp4
```

The preview script writes early, middle, and final PNGs for each scene to `rendering/out/activity-animations/`.
