# Progress tracker — prompt-to-video

Prompt → LLM plans the video → React/Remotion scenes → MP4.
**Scope (v1):** React/Remotion only. No ComfyUI, no third-party image generation. Narration uses Deepgram TTS (only third-party audio). All visuals are code (SVG, CSS, Three.js).

Legend: `[x]` done · `[~]` partly done · `[ ]` not started

_Last updated: 2026-11-19 (89 scene contracts; word-synced cues, 3D iso designs, lecture-style plans, plan repair + salvage)_

---

## 1. Project setup

- [x] Folder layout: `backend/`, `rendering/`, `library/`, `skills/`, `workspace/`, `docs/`
- [x] `.gitignore` (env, venv, node_modules, renders, workspace, brief)
- [x] `.env` / `.env.example` loaded from project root
- [x] All packages pinned to exact versions (Remotion 4.0.539 everywhere)
- [x] First commit of `backend/`, `rendering/`, `docs/`

## 2. Backend foundation (Python / FastAPI)

- [x] FastAPI app — `backend/app/main.py` (`uvicorn app.main:app` from `backend/`)
- [x] LLM via MLflow AI Gateway (OpenAI-compatible) — `backend/app/utils/llm.py`
- [x] `POST /llm/chat` endpoint, tested end to end (gpt-6-luna)
- [~] Gateway route: using `summary` for now
  - [ ] Create dedicated `text-to-video` route in MLflow and set `DEFAULT_MODEL`
- [ ] Move `utils/llm.py` → `services/llm.py` (optional, matches the brief)

## 3. Rendering engine (build step 1) — done

- [x] Remotion project in `rendering/` (React 19, TypeScript 5.9)
- [x] `composition.json` drives the whole video (fps, size, theme, scenes)
- [x] Generic `VideoComposition` + `registry.ts` (name → component)
- [x] Theme from JSON (global + per scene), `useTheme()` / `useUnit()` scaling for 16:9, 9:16, 1:1
- [x] Transitions from JSON: fade / slide / wipe / flip / none
- [x] Unknown component → red error scene (no crash)
- [x] Render from external JSON: `npx remotion render VideoComposition out/x.mp4 --props=file.json`
- [x] Styling decision: pure CSS (inline styles + theme), no Tailwind

## 4. Scenes (build step 2) — done

### Core
- [x] `TitleScene` — title + subtitle, entrance animations
- [x] `BulletListScene` — staggered items, custom bullets/timings
- [x] `QuoteScene` — quote + author, slow zoom
- [x] `GlobeScene` (3D, Three.js) — WAN
  - [x] Routes by country or city name, follow camera, packets with trails, labels, highlights
  - [x] Satellite surface (NASA Blue Marble), atmosphere, stars
  - [x] Official India boundary (Survey of India outline) + geography check script
- [x] `InfrastructureScene` / `BuildingScene` / `TechnologyScene` — buildings & devices grow, hold, disappear

- [x] `NetworkScene` — devices + cables + moving packets; star / bus / ring / mesh (LAN, topologies)
- [x] `ComparisonTableScene` — LAN vs MAN vs WAN, rows reveal
- [x] `ZoomOutScene` — room (LAN) → city (MAN) → globe (WAN)
- [x] `CityNetworkScene` — buildings linked by fibre ring (MAN)
- [x] `PacketJourneyScene` — laptop → router → ISP → internet → server, step labels
- [x] `DefinitionScene`, `ExampleCardScene`, `StepsScene`, `QuizScene`, `SummaryScene`

### Library expansion — planner-ready
- [x] `ChartScene` — bar / line / area, 1–4 series, axes, grid, legend, value labels
- [x] `EquationScene` — KaTeX formulas and derivations, 1–5 revealed steps
- [x] `TimelineScene` — horizontal or vertical dated events, 2–7 cards
- [x] `FlowchartScene` — dagre layout, start / process / decision / end nodes, labeled edges
- [x] `CodeScene` — syntax-highlighted code, line numbers, highlighted lines, line-by-line reveal
- [x] `MapScene` — Natural Earth flat map, highlighted countries, city markers, animated routes
- [x] `StatScene` — animated key number with optional comparison bars
- [x] `ImageScene` — local/remote figures with caption, credit, and pan/zoom motion
- [x] `CycleScene` — circular process diagram, 3–8 stages, animated arrows
- [x] `VennScene` — two-circle comparison with left-only, right-only, and shared points

### Devices & pointer
- [x] 2D device icons — `components/Device.tsx` (63 kinds: lucide + custom SVG in `components/icons.tsx`), `DeviceGridScene`
- [x] 3D models for modem, hub, coaxial, fibre, undersea-cable, isp, resistor, capacitor, motherboard, hacker (`three/models/extra.tsx`) — all 63 kinds now have 2D + 3D
- [x] Realistic 3D devices — `components/three/` (procedural, all 63 kinds), `<Device3D>` / `<DeviceModel>`, `Device3DScene`
- [x] States for both: off / on / active / error, plus `changes` at frames
- [x] Realistic mouse pointer — `components/Pointer.tsx` (arrow / hand / text, path + clicks with ripple)
- [x] Old scenes use the realistic models: `InfrastructureObject` now draws `DeviceModel` (Network, PacketJourney, Infrastructure/Building/Technology, City, ZoomOut) and accepts any device kind
- [x] `ExampleCardScene` draws its object as paper iso art (all 65 device kinds mapped to iso objects / icon tiles), no 3D canvas
- [x] Lesson scenes on paper: Title, Explain, BulletList, Quote, Definition, ExampleCard, Steps, Summary, Quiz, ComparisonTable, Timeline, Flowchart, Stat, Equation (`VideoComposition` paper stage)
- [x] IsoScene status cues: object badges (checking / found / miss / offline / online …), lookup badge, media cues and flows — see `examples/iso-badges.json`, `iso-cues.json`, `iso-media-cues.json`, `iso-media-flows.json`
- [x] Shared motion effects, 2D (`src/effects/`): `FlowPath` packet / current / light / bits, `SignalWaves`; 3D (`three/effects.tsx`): `Flow3D`, `Movers`, `Waves3D`
- [x] Shared annotations: `Callout`, `Mark` (check / cross), `Badge`
- [x] `overlays` on any scene in JSON (flow, waves, callout, check, cross, badge, arrow, pointer) — validated by `npm run validate`
- [x] `ConnectionScene` (2D or 3D devices + animated links) and `DeviceDemoScene` (app window, typing, button, pointer, device reacts)
- [x] Old Network / City cables use the shared 3D `Movers` (NetworkScene `effect`: packet / light / current / dot)
- [x] UI kit: `AppWindow` (title or URL bar), `TextField` (typing, password mask), `UIButton` (press + ripple) — `components/ui.tsx`
- [x] UI overlays: `terminal`, `notification`, `toggle` (switch / checkbox), `chat` (`src/effects/ui.tsx`)
- [x] Per-device `color` in `DeviceGridScene`, `ConnectionScene`, `Device3DScene`, `DeviceDemoScene`, `InfrastructureScene`
- [x] Per-device `glow` (screen / LED / ring colour) for 2D + 3D devices
- [x] More motion: `field` (magnet / dipole / ± charge), `sound` (sine wave), `progress`, `lock` (padlock + text → ciphertext); 3D `FieldLines3D`, speaker sound rings, `lock` + `magnet` device kinds (65 kinds)
- [x] More annotations: `highlight` (box + spotlight), `tooltip`, `zoom` (magnifying lens over the real scene)
- [x] Named positions for overlays (`top-left` … `bottom-right`); edge-aligned near frame edges
- [x] `CircuitScene`, `WirelessScene` (ConnectionScene presets), `BlankScene` (base for overlays) — see `examples/more-effects.json`
- [x] Circuit and wireless: covered by `ConnectionScene` (`current` / `waves` links), see `examples/effects-demo.json`

### Motion kit (education-style animation)
- [x] `src/motion/`: `AnimatedText` (words / letters / lines / typewriter / fade), `Highlight`, `Underline`, `CircleMark`, `Stagger`, `CountUp`, `Pulse`, `Exit`, `DrawArrow`
- [x] Text markup in JSON: `**bold**` `==highlight==` `__underline__` `((circle))`, `\n` = new line
- [x] 10 entrance types in `animation.ts` (added pop, blur, rise, slide-right, slide-down)
- [x] Used by Title, BulletList, Quote, `StudyFrame` titles, and new `ExplainScene`
- [x] Kit used in Definition, ExampleCard, Steps, Quiz, Summary (markup + `textAnimation` in all text fields; StudyFrame footer animates)

### Test videos
- [x] `examples/networking-complete.json` — 13 scenes, 68 s, renders with no code change (~36 s render)
- [x] Other examples: `networking-priority`, `study-gallery`, `network-{star,bus,ring,mesh}`, `globe-*`, `infrastructure`
- [x] `examples/library-showcase.json` — 13 scenes, 53 s, covers all ten new components (`LibraryShowcase`)

### Course components (planned, build later)
Order: 1 → 5. Every scene fully JSON-controlled; algorithm scenes compute their own steps.
- [~] 1. Shared: `GraphScene` (nodes/edges, spread), `TreeScene` (BST/heap/org chart), `TableScene` (SQL, truth/DP tables)
  - [x] `GraphScene` (BFS/DFS/Dijkstra), `TreeScene` (BST/AVL/general tree)
  - [x] Database tables: `QueryScene`, `PipelineScene`, `TableScene` (insert / update / delete), `JoinScene`, `SchemaScene` (ER), `TransactionScene` (commit / rollback)
  - [x] Truth tables (`TruthTableScene`), DP tables (`DPTableScene`)
- [x] 2. DSA: `ArrayScene` (indices, swaps, i/j pointers), `SortingScene` (bubble/selection/insertion/merge/quick from `{algorithm, input}`), linked list, stack/queue, hash table, BFS/DFS/Dijkstra, recursion call stack, Big-O race, code trace with variables
  - [x] `ArrayScene` (bubble/selection/insertion/merge/quick, binary/linear search), `LinkedListScene`, `StackScene` (stack/queue), `HashScene`, BFS/DFS/Dijkstra, `EventLoopScene` (call stack + heap + queues)
  - [x] `RecursionScene` (call stack), `BigORaceScene`, `CodeTraceScene` (code + variables); `BubbleSortScene` staged by the agent
- [x] 3. Maths: `PlotScene` (y = f(x), tangent, area), `GeometryScene`, number line, unit circle, vectors, matrix multiply, probability (coin/dice/tree), fractions, algebra steps
  - [x] `PlotScene` (formulas, live params, trace, tangent, area, zoom) + `LiveChartScene` (bar/line/race charts recalculated from data or a formula)
  - [x] `GeometryScene`, `NumberLineScene`, `UnitCircleScene`, `VectorScene`, `MatrixMultiplyScene`, `ProbabilityScene`, `FractionScene`, `AlgebraStepsScene`, `RaceScene`
- [ ] 4. CS: `SequenceScene` (HTTP/DNS/TCP handshake), `LayerStackScene` (OSI, encapsulation), `LogicGateScene` + truth table, binary/hex, CPU fetch-decode-execute, Gantt scheduling, memory/paging
- [~] 5. Mass communication: communication models (Shannon–Weaver, SMCR, Lasswell with noise + feedback), generic media mockups (newspaper, breaking-news ticker, social post, video player, podcast), viral spread, camera shots / rule of thirds, agenda-setting funnel
  - [x] `MediaTheoryScene` (Shannon–Weaver with noise + feedback, agenda setting, two-step flow), `FrontPageScene`, `StudioScene`, `FeedScene`, `SpreadScene`, `NewsCycleScene`, iso media objects (video player, podcast booth, social post)
  - [x] `PrintDeliveryScene`, `SatelliteNewsScene`, `SignalHomesScene`, `RadioTuningScene`, `CreatorWorkflowScene`; ~110 media / PR / politics / newsroom iso objects
  - [ ] SMCR / Lasswell models, breaking-news ticker, camera shots / rule of thirds
- [~] Lecture scenes: `WorkedExampleScene` (cued stages beside a live table), `OutcomeComparisonScene`, `AnnotatedTextScene` (request / sentence / excerpt with notes)
- [ ] Common: `MindMapScene`, `PyramidScene` / `FunnelScene`, `CharacterScene` (avatars + speech bubbles), `WhiteboardScene` (hand-drawn)
- [ ] `LayersScene.tsx` exists in `src/scenes/` but is not registered yet

### Audio
- [x] Deepgram TTS in the backend: `app/utils/tts.py` (cached WAV clips in `rendering/public/audio/tts/`), `app/utils/render.py` (narration → voice + scene lengths, validate, Remotion render to `workspace/jobs/<id>/video.mp4`)
- [x] API: `POST /tts` (text → WAV), `POST /render` (composition → MP4), `GET /render/{id}/video`, `GET /render/{id}/composition`; CLI: `python -m app.cli tts|voice|render`
- [x] Code-generated SFX (`npm run sfx` → `public/sfx/`): click, pop, whoosh, typing, ding, success, error, lock, notify
- [x] Built-in sounds: pointer clicks, device pop-in, ✓ ding / ✗ error, badge / callout / chat pop, toast notify, toggle click, lock, typing (terminal, text field, typewriter), progress success, whoosh on transitions
- [x] JSON: composition `audio` (effects on/off + volume, transitions, voice, voiceVolume, `music` with ducking under narration); scene `voice` (own recording works too) and `sfx` cues
- [x] Captions from the narration: word timings via Deepgram speech-to-text on our own clip (estimate fallback), word-by-word highlight; on/off + style from JSON `captions`, API (`captions: true/false` on `/render` and `/video`), CLI (`--captions` / `--no-captions`)
- [x] Planner (`app/utils/planner.py`): LLM writes the composition with narration per scene from a compact scene catalog; validated, errors fed back (3 tries). API `POST /plan`, `POST /video` (prompt → plan → voice → captions → MP4); CLI `plan`, `video`
- [x] Transcripts: every render writes `transcript.json` (per scene, sentences with start/end seconds) + `transcript.txt` (`[mm:ss]` lines); `GET /render/{id}/transcript`; older jobs get them on first request
- [x] Deepgram limits: per-loop semaphore (`DEEPGRAM_CONCURRENCY`) + backoff on 429 (`DEEPGRAM_RETRIES`)
- [x] **Word-synced animation** (`app/utils/cues.py`): steps/actions/messages take `"cue": "<spoken word>"`, objects/links `"appearCue"`; resolved from Deepgram word times after TTS (text estimate for validation). Only 0-1 timing fields from the registry are filled. Live test: 7/7 changes land on their word
  - [ ] Scenes with a fixed built-in animation (Transaction, Summary, Timeline…) have no cue-able steps yet
- [ ] Long renders: move `/render` onto the job queue (now it waits for the MP4)

### Long videos (20-40 min) — `app/utils/long_video.py`
- [x] Outline (1 LLM call): chapters, goals, key points, minutes → word budgets (150 wpm), glossary, running examples, visual style
- [x] Each chapter planned by the normal planner + context (whole outline, glossary, examples, what earlier chapters covered, budget); re-planned once if >35% off its word budget; fails with a retryable chapter error if both attempts miss the budget
- [x] Saved, resumable state (`workspace/long/<id>/state.json`, `chNN.plan.json`): pending → planned → rendered / failed; a rerun skips finished chapters
- [x] Edit: replace the outline, replace a chapter's plan (validated), redo one chapter (plan or render, optional cascade)
- [x] Render each chapter (sequential), join with ffmpeg (stream copy, re-encode fallback) + chapter markers + YouTube timestamps
- [x] API `POST /long`, `GET /long[/{id}]`, `POST /long/{id}/run`, `PUT /long/{id}/outline`, `GET|PUT /long/{id}/chapters/{n}/plan`, `POST /long/{id}/chapters/{n}/redo`, `GET /long/{id}/video`; CLI `long`, `long-run`, `long-status`, `long-redo`
- [x] Whole-video captions (`captions.srt` / `.vtt`) and transcript with chapter headings; `GET /long/{id}/captions`, `GET /long/{id}/transcript`
- [x] Resume endpoint runs on the event loop; per-job file locks prevent overlapping runs and edits, including during plan validation
- [ ] Background runs are in-process tasks: after a server restart call `/long/{id}/run` to resume (no auto-resume / real queue yet)
- [x] Parallel chapter rendering (bounded): `LONG_RENDER_WORKERS`, planning overlaps rendering
- [x] Planner variety: `teach-code` hard rules (CodeScene per chapter + terminal output), style check `PLANNER_MAX_TEXT_RUN=3` (one retry, valid plan never lost), catalog shows number limits (`width: num 300..1800`)
- [x] More CodeScenes per chapter: planner check asks for one per concept (`PLANNER_CODE_EVERY`)
- [x] Length: `minutes` is a ceiling (default 30), content decides; `fixed_length` makes it exact
- [x] A stubborn invalid scene no longer fails the chapter (plan repair + salvage, see §6); failed job `53c8dfcd2d` re-planned fine

### One video API
- [x] `POST /videos` (`length`: short | long, `layout`: desktop | mobile | square), `GET /videos/{id}`, transcript + captions; old jobs readable (`video_jobs.py`); Postman collection in `docs/postman/`

## 5. Library contract & registry

- [x] Zod props schema + description + tags for every scene (89 entries) in `src/registry.ts` → `sceneCatalog`
- [x] `check:scenes` also exports `library/lucide-icons.json` (2,091 icon names for the backend)
- [x] Validator "did you mean": wrong kind / icon / component names get the closest matches instead of the full list
- [x] Schemas are strict: unknown props (typos like `"titel"`) are errors, not silently dropped
- [x] `library/registry.json` generated by `npm run check:scenes` (Zod 4 `z.toJSONSchema()`, defaults as example)
- [x] Props validated in `VideoComposition` (render fails with the exact message)
- [x] `npm run validate <file.json>` — checks components, props, durations, duplicate ids before rendering; exit 1 + exact JSON path per error
- [x] `npm run check:visual` — renders stills of the networking and expanded-library scenes for a visual check
- [ ] Real `version` and hand-picked `example` per scene (currently `1.0.0` and the schema defaults)
- [ ] Auto scene length from props (e.g. `globeSceneFrames`) instead of hand-typed `durationInFrames`
- [ ] Move library out of `rendering/src/` to top-level `library/` (needs bundler alias)

## 6. Planner agent (LLM → JSON)

- [x] Planner prompt + call through the gateway; validate with the scene contracts, retry with the errors (`app/utils/planner.py`)
- [x] LLM writes `composition.json` directly from a compact catalog built from `registry.json` (no separate script.json step)
- [x] Durations: planner gives a rough length, the narration step stretches each scene to fit its speech
- [x] Topic filter: only core + matching scenes go in the prompt (LAN/MAN/WAN plan: ~5.3K input tokens, was ~9–10K)
- [x] Planner modes: `catalog` (filtered prompt, 1 call), `tools` (search_scenes / get_scene / list_device_kinds / get_overlay via the Responses API), `auto` (tools once the library has > 80 scenes)
- [x] Catalog reloads when `library/registry.json` / `library/overlays.json` change (no backend restart); overlays' fields exported to `library/overlays.json`
- [~] Planner quality: few-shot example videos, per-subject guidance, scene variety checks
  - [x] Per-subject guidance (`skills/`), scene variety checks (text-run / text-share limits)
  - [ ] Few-shot example videos
- [x] Skill router: one LLM call picks the guides (`SKILL_ROUTER=llm|keyword`); `visuals` rules in skill frontmatter (topic words → required scenes, checked)
- [x] Lecture-style plans for tech AND non-tech: max 5 of one scene in a row, one scene ≤ 70% of a plan, same iso picture ≤ 3 times (`PLANNER_MAX_SAME_*`); suggestions come from the selected guides
  - [x] "Show the real thing" rule (code/JSON, headline, date/map, chart, equation); teacher voice (hook, "you", questions, recap) in `video-foundation`
  - [x] Narration lint: "Term = meaning" glossary lines, phrases repeated across scenes
  - [x] Required scenes for history, geography, newspapers, social media, statistics, speeches; REST/API → Terminal/Editor
  - [ ] Narration still reads disclaimers aloud ("this is an illustrative front page") — move them to a small on-screen tag
- [x] IsoScene objects like a real harness: no flat 179-name list when the guide covers them; `find_iso_objects(idea)` tool (kinds → Lucide icons → saved designs)
- [x] Plan repair (`plan_repair.py`): scoped field edits; context shows what a field must match (table columns, existing object ids); a scene still broken is repaired whole; last resort replaces ≤ 25% invalid scenes with title cards keeping their narration

### Custom iso designs (`app/utils/iso_design.py`)
- [x] Order: built-in kind → Lucide icon (no LLM call) → saved design → designer
- [x] Designer returns 3D shapes (box, cylinder, sphere, flat detail); code projects at 30°, shades like built-ins, fits the frame; may answer with an icon for abstract ideas
- [x] Unique aliases; designer sees only the concept + label; failures fall back to a plain tile; saved-design hint capped at 20
- [ ] 7 old flat-style designs left (`api-request`, `http-method`, `watch-*`…); delete to redraw in 3D
- [ ] Job-local new scenes (opt-in `allow_new_scenes`) or a "missing scenes" report for the component agent

## 7. API, queue, storage

- [ ] `POST /jobs`, `GET /jobs/{id}`, `GET /jobs/{id}/artifacts`
- [ ] Redis + RQ/Celery worker; status in Redis (`queued` → `planning` → … → `done`/`failed`)
- [ ] Worker calls the renderer with the job's `composition.json`
- [ ] Upload MP4 to MinIO/S3, return URL
- [ ] Delete old `workspace/jobs/*` on a schedule

## 8. Agent writes new components

- [x] Sandboxed file tools (`app/agent/sandbox.py`): list_dir, read_file, glob, grep (rendering/src, examples, library, docs; never .env / node_modules); write_file, edit_file, delete_file only in `workspace/jobs/<job>/`
- [x] Checks (`app/agent/staging.py`): rules (import allow-list, no randomness / clock / timers / network) → typecheck → contract (registered, metadata, defaults) → render frames 10 / middle / last; the agent sees the frames
- [x] Staging: passing scenes go to `rendering/src/staging/` (manifest + generated index), usable in videos and visible to the planner; failed drafts never enter `src/`
- [x] Promote (→ `src/scenes/` + `registry.ts`, rolled back on failure) / unstage
- [x] API: `POST /components`, `GET /components`, `POST /components/{name}/promote`, `DELETE /components/{name}`; CLI `component`, `staged`, `promote`, `unstage`
- [x] Token controls (history window, one-turn frames, paged reads, pre-call budget, `usage.json`), see `docs/Agent-harness.md`
- [x] Publish only on `finish` (checks never publish; publish is all-or-nothing with rollback)
- [ ] Run generated code in an isolated worker (no credentials / network); semantic animation tests with several prop sets
- [ ] Planner calls the agent automatically when no scene fits a topic

## 9. Validation & fix loop

- [x] Typecheck + rule check (frame-driven only, import allow-list, no network/fs)
- [x] Render still frames (first / middle / last)
- [x] Feed errors back to the agent (max `AGENT_MAX_CHECKS` = 6 checks, `AGENT_MAX_STEPS` = 40 calls)
- [x] Promote passing components from staging → library, update registry
- [ ] Fallback to a generic scene when the agent gives up (the planner already salvages invalid scenes as title cards)

## 10. Production

- [ ] Docker Compose: api, worker, redis, renderer, minio
- [ ] Sandbox per job (no secrets, limited network/CPU/time)
- [~] Logs / observability: coloured console logs with request ids and LLM call logging done; no metrics / tracing yet

---

## Decisions

| Topic | Decision |
|---|---|
| Audio | Deepgram TTS for narration (approved), code-generated SFX, optional own music/voice files. |
| Images | None from services; visuals are SVG/CSS/Three.js. Local bundled assets allowed (e.g. Blue Marble). |
| Styling | Inline CSS + theme from JSON. No Tailwind in `rendering/`. |
| 3D | Three.js via `@remotion/three`; every animation driven by `useCurrentFrame()`. |
| Libraries | Installed: dagre, d3-scale, d3-shape, katex, d3-geo, world-atlas, topojson. Add others only when a scene needs them. |

## Known issues

- `skills/teach-media` body is over the 7000-character limit: topics routed to it fail to plan (the planner then retries `load_skill` until its call limit) and 1 backend test fails. `iso-diagrams` is back under the limit.
- MLflow route `summary` is shared with another service's usage tracking.
- Scene durations are typed by hand in JSON; a too-short scene cuts animations off.
- Survey of India outline is for visualization, not a certified survey map.

## Component harness token controls

- [x] Bound complete conversation turns, including old source-bearing tool arguments; preserve a compact tool activity ledger.
- [x] Consume rendered frames once; require a later review turn before finish.
- [x] Paginate default file reads and reserve input budget before dispatch (conservative local estimate, not a provider billing cap).
- [x] Record per-call usage/cache/latency in each job's `usage.json`; offline regressions and opt-in TEST-only live smoke.
- [ ] Same-request end-to-end cost/quality benchmark on TEST; semantic animation assertions and varied props.
- [ ] Separate validation from staging publication; transactional rollback for all staging artifacts; isolated execution worker.

See `docs/Agent-harness.md` for controls, commands and limitations.
