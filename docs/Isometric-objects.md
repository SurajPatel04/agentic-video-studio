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

## AI and emerging media

| Kind | Shows | Aliases |
| --- | --- | --- |
| `aigeneratedlabel` | A post card with an **AI** badge and an `AI-GENERATED` caption | `ai-label`, `ai-generated`, `ai-content-label`, `content-label` |
| `aivoice` | A friendly robot talking: its mouth is a moving waveform, the antenna glows, the eyes blink, and a speech bubble shows an AI sparkle and the spoken waveform | `syntheticvoice`, `synthetic-voice`, `voice-clone`, `cloned-voice`, `ai-voice`, `speech-synthesis`, `tts`, `text-to-speech` |
| `alteredimage` | Two photos side by side with a comparison slider; the altered copy has a duplicate figure, a glitch slice and a coral dashed frame | `altered-image`, `altered-image-comparison`, `image-comparison`, `edited-photo`, `deepfake` |
| `recommendation` | A **FOR YOU** screen: your history (liked chips) flows into an AI engine and out to a ranked feed with match scores (96%, 74%, 48%) | `recommendation-system`, `recommendations`, `recommender`, `algorithm-feed`, `feed`, `suggested-content` |
| `verified` | A **VERIFIED** panel: a shield, a photo with a green check seal, a Source / Date / Place checklist and a "3/3 checks" bar | `provenance`, `verification`, `verification-panel`, `provenance-panel`, `fact-check`, `content-credentials`, `authenticity` |

Use these for AI-generated content labels, AI voices and voice cloning, altered or deepfaked images, recommendation and algorithm feeds, and verified content and fact checks. They follow the same paper style and work anywhere `IsoScene` accepts an object `kind`. The preview gallery has an AI & emerging media sheet.

## Radio, audio and podcasts

| Kind | Shows | Aliases |
| --- | --- | --- |
| `headphones` | Over-ear headphones with a thick headband, deep ear cups and a trailing cable | `headphone`, `headset`, `over-ear-headphones` |
| `mixingconsole` | A low sound board with a **MIX** meter bridge, channel knobs and eight faders | `mixer`, `mixing-desk`, `sound-board`, `soundboard`, `audio-console`, `audio-mixer` |
| `boommic` | A weighted desk stand with an articulated boom arm, shock mount and hanging capsule | `boom-mic`, `boom-microphone`, `mic-boom`, `shotgun-mic`, `boom-arm` |
| `speaker` | A studio monitor cabinet with a woofer, tweeter, front port and plinth | `loudspeaker`, `studio-monitor`, `monitor-speaker`, `audio-speaker`, `hifi` |
| `audiorecorder` | A field recorder with a **REC** waveform screen, transport keys, jog wheel and two XLR inputs | `audio-recorder`, `field-recorder`, `digital-recorder`, `sound-recorder`, `dictaphone` |
| `podcastbooth` | An open studio corner with foam walls, an **ON AIR** sign, a table, two desk mics and headphones | `podcast`, `podcast-studio`, `podcast-room`, `recording-booth`, `studio-booth` |

Use these for radio, music, audio production, voice recording, podcasting and studio scenes. They follow the same paper style and work anywhere `IsoScene` accepts an object `kind`. The preview gallery has a Radio, audio & podcasts sheet.

## Expanded media collections

All entries below work as `IsoScene` object `kind` values and share shaded faces, outlined geometry and deterministic frame-driven detail animation. Existing audio kinds are retained; headphone/boom outlines and console fader placement have been corrected.

| Collection | Kinds |
| --- | --- |
| Radio, audio and podcasts | `headphones`, `mixingconsole`, `boommic`, `speaker`, `audiorecorder`, `podcastbooth` |
| Television and broadcasting | `studiocamera` (three-legged tripod, lens, handle, tally light), `newsdesk` (also `anchor-desk`), `teleprompter`, `studiolights`, `controlmonitors`, `obvan` |
| Film and entertainment | `clapperboard`, `cinemaprojector`, `cinemascreen`, `filmreel`, `storyboard`, `editingtimeline`, `theatrestage` |
| Digital and social | `socialpost`, `scrollingfeed`, `videoplayer`, `livestream`, `comments`, `repost`, `notification`, `hashtag` |
| Advertising and business | `productdisplay`, `campaignboard`, `sponsoredpost`, `adplacement`, `paywall`, `adpayment` |

Hyphenated aliases include `tripod-camera`, `studio-camera`, `studio-lights`, `control-room-monitors`, `outside-broadcast-van`, `film-reel`, `editing-timeline`, `social-post`, `scrolling-feed`, `video-player`, `livestream-window`, `product-display`, `campaign-board`, `sponsored-post`, `ad-placement`, `subscription-paywall`, and `payment-flow`.

`adpayment` shows advertiser → payment → publisher. Sponsored posts and ad placements are visibly labelled. The film reel, editing playhead, feed and video progress respond to scene time.

Run `npm run previews:iso` from `rendering/` for the SVG sheets and interactive gallery in `rendering/out/iso-collections/index.html`. Run `node render-media.mjs` for rendered sheets in `test_picture/iso-icon/18-media/`.

## Public relations and organisations

| Kind | Artwork |
| --- | --- |
| `pressrelease` | Layered press-release document, release heading and media-contact footer |
| `podium` | Raised lectern with three microphones and a briefing seal |
| `pressconference` | Branded backdrop, three panelists, microphone table and attending reporters |
| `spokesperson` | Standing representative holding a written statement beside a microphone |
| `mediakit` | Open folder containing a fact sheet, photo and contact card |
| `crisiscentre` | Response room with operators and alert, verification and response monitors |

Aliases: `press-release`, `press-release-document`, `podium-with-microphones`, `press-conference`, `media-kit`, `crisis-response-centre`, `crisis-response-center`. Example: `rendering/examples/iso-public-relations.json`. Render the collection with `cd rendering && node render-media.mjs publicrelations`; the sheet is saved to `test_picture/iso-icon/18-media/publicrelations.png`.

## Politics and public affairs

| Kind | Artwork |
| --- | --- |
| `parliament` | Legislative building with steps, columns, pediment and flag |
| `ballotbox` | Slotted ballot box with a marked paper ballot |
| `campaignrally` | Campaign stage, speaker, lectern, crowd and voting banner |
| `publicmeeting` | Community meeting with agenda board, facilitator, table and residents |
| `protestplacard` | Handheld placard on a wooden pole reading “Our voices matter” |
| `governmentoffice` | Public information building, service sign, entrance and noticeboard |

Aliases include `parliament-building`, `ballot-box`, `campaign-rally`, `public-meeting`, `protest-placard`, `government-information-office` and `government-office`. Example: `rendering/examples/iso-public-affairs.json`. Render with `cd rendering && node render-media.mjs publicaffairs`; the sheet is saved to `test_picture/iso-icon/18-media/publicaffairs.png`.
