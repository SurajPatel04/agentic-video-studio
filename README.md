# Agentic Video Studio

Reusable, frame-driven Remotion scenes for study videos.

```sh
cd rendering
npm ci
npm run studio
```

Select **NetworkingDemo** for the complete LAN/MAN/WAN visual lesson, **NetworkingPriority** for the three priority scenes, **StudyGallery** for teaching cards, **LibraryShowcase** for all ten new planner-ready scenes, **InfrastructureDemo** for buildings/devices, or **GlobeDemo** for WAN routes.

```sh
cd rendering
npm run typecheck
npm run check:scenes
npm run check:visual
npx remotion render NetworkingDemo out/networking-complete.mp4
npx remotion render LibraryShowcase out/library-showcase.mp4
```

Scene controls and examples:

- [Expanded scene library](docs/Library-scenes.md)
- [Networking and teaching scenes](docs/Networking-scenes.md)
- [Buildings and devices](docs/Infrastructure-scenes.md)
- [Satellite globe and India boundaries](docs/Globe-scenes.md)
- [Machine-readable scene registry](library/registry.json)

The demos provide visuals; narration and audio assembly belong to the backend pipeline.

## Teaching guides

The backend discovers project playbooks in `skills/<name>/SKILL.md`. Every automatically planned video receives `video-foundation`, which handles audience, purpose, language, narration, visual choices, factual grounding, and an appropriate ending across subjects. Optional format guides cover lectures (`teach-lecture`), explainers (`make-explainer`), and ads (`make-ad`). Programming, networking, algorithms, and mathematics guides remain optional subject supplements, alongside long-video pacing and component design. They guide teaching choices; scene contracts remain authoritative. Terminal overlays show supplied expected output, not executed code.

`POST /plan`, `/video`, `/long`, and `/components` accept:

- Omitted `skills` (or `null`): include the universal foundation plus at most one matching format guide and two subject guides (planner); component guides remain role-specific.
- `"skills": ["video-foundation", "teach-lecture"]`: use only the named guides. Explicit lists do not automatically add the foundation.
- `"skills": []`: disable guides.

`GET /skills` lists planner guides; `GET /skills?role=component` lists component guides. `/plan` reports the guides used. Long-video jobs save their selected names and reuse them for every chapter and resume. Automatic long-video selection includes pacing; explicit overrides include it only if named. Guide files are reloaded, so editing a guide also affects future planning of existing jobs.

Catalog planning includes selected guides and their relevant scene/overlay contracts without an additional model call. Tool planning and the component agent see descriptions first and use `list_skills` / `load_skill` to read bodies. Selected guides must be loaded before a plan is accepted or a component is written. Automatic tool mode may load other relevant guides; explicit lists restrict access.

CLI examples (from `backend`, with the virtual environment active):

```sh
python -m app.cli plan "How Node.js works" --mode catalog --skills teach-code
python -m app.cli long "How Node.js works" --minutes 30 --plan-only --skills teach-code long-video-pacing
python -m app.cli plan "How Node.js works" --skills
```

To add a guide, copy an existing `SKILL.md` and give it a matching directory/name, a concise description, and `metadata` containing `roles`, matching `tags`, and optional `scenes` / `overlays`. `category` is `foundation` (always included in automatic selection), `format`, or `subject` (default). Multiword tags match whole phrases. `long_video: true` adds the guide during automatic long-video selection. Keep bodies below 7,000 characters. Invalid metadata is logged and skipped; unknown explicit names return HTTP 422. Adding a guide needs no Python changes.

Offline regression checks:

```sh
PYTHONPATH=backend .venv/bin/python -m unittest discover -s backend/tests -p 'test_skills.py'
PYTHONPATH=backend .venv/bin/python -m unittest discover -s backend/tests -p 'test_long_video.py'
```

The foundation interprets the full brief, including prompts whose language or subject does not match any tags. Format matching is a keyword heuristic, not a semantic classifier: a lecture about advertising and an ad for a course can share words. Guides explicitly defer to the requested purpose; use an explicit skills list when a routing choice is unsuitable. Long-video chapters receive the original user brief so language and format are preserved even when chapter titles omit them.

Current limits: guides improve instructions, not factual verification or guaranteed teaching quality. The pipeline has no automatic research/source-checking stage, and JSON validation checks component compatibility rather than correctness or learner comprehension. Available scenes and supplied assets limit what can be shown; a guide cannot create missing footage or animations. Narration budgets estimate duration, not exact runtime. Inspect a generated plan and preview before treating a lecture or ad as ready to publish. Existing saved plans are not regenerated when guides change, and jobs with saved explicit guide lists keep those lists.
