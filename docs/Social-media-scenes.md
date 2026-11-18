# Social and digital media

Select **SocialMediaDemo** in Remotion Studio. `rendering/examples/social-media.json` contains all ten requested animations. The additions reuse the shaded isometric artwork and paper stage.

| Animation | Scene and controls |
| --- | --- |
| Feed scroll | `FeedScene`, `mode: "scroll"`; posts with author, text, score, likes, shares; comment |
| Algorithm ranking | `FeedScene`, `mode: "ranking"`; posts move to descending score order |
| Viral spread | `SpreadScene`, `mode: "viral"`; post text and unique reach count |
| False news vs fact check | `SpreadScene`, `mode: "race"`; correctionDelay (0.1–0.45 of duration), correctionSpeed (0.5–2) |
| Creator workflow | `CreatorWorkflowScene`; views target; camera, editing timeline, upload, views |
| Communication model | `MediaTheoryScene`, `mode: "communication"`; message text; noise and added feedback loop |
| Agenda-setting | `MediaTheoryScene`, `mode: "agenda"`; headline; days and attention meter |
| Gatekeeping | Existing `NewsCycleScene`; stories with label and selected flag |
| Two-step flow | `MediaTheoryScene`, `mode: "two-step"`; media, opinion leaders, public |
| Uses and gratifications | `MediaTheoryScene`, `mode: "gratifications"`; news, entertainment, connection |

`PhoneScene` already supports generic scrolling. `FeedScene` adds the engagement counters, comment and score-based reorder that were missing. Gatekeeping reuses `NewsCycleScene` instead of duplicating it.

Metrics and ranking scores are illustrative. Race mode counts people reached by each message independently, including overlap. Receipt of a correction does not establish belief change. Agenda-setting shows attention, not agreement. Feedback is explicitly presented as an extension to the Shannon–Weaver transmission model.

```sh
cd rendering
npm run studio
npm run validate -- examples/social-media.json
node scripts/preview-social-media.mjs
```

Previews are saved to `rendering/out/social-media/`. All new scene schemas accept empty props and timing scales with scene duration.
