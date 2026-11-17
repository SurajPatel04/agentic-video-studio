---
name: teach-code
description: Teach programming with small code examples, expected output, and runtime
  diagrams.
metadata:
  roles:
  - planner
  tags:
  - programming
  - code
  - javascript
  - node.js
  - nodejs
  - python
  - typescript
  - api
  - npm
  - libuv
  - v8
  scenes:
  - CodeScene
  - FlowchartScene
  - CycleScene
  - QuizScene
  overlays:
  - terminal
  long_video: false
---

Hard rules for programming topics (they override softer advice below):
- At least 1 CodeScene in every 5 scenes (a 15-scene chapter has 3 or more): one per main concept, each a step of the same running example. Show the code that produces the behavior you explain; a diagram alone is not enough.
- When code produces output, show it in the NEXT scene: a BlankScene (title like "Output") with a "terminal" overlay at "center". Never put a terminal on a CodeScene or a text scene: it covers the code / text. Two outputs side by side: two terminals at {"x": 27, "y": 55} and {"x": 73, "y": 55}, width about 760.
- Never more than 2 DefinitionScene / ExplainScene in a row; break them with code, a diagram, or a comparison.
- Pattern per concept: CodeScene (what we write) -> diagram (what the runtime does) -> output (what we see).

Teach observable behavior before introducing terminology. For executable concepts, use a small CodeScene example (usually 5–12 readable lines), highlight the relevant lines, and explain what the viewer should notice. Keep identifiers and inputs consistent between code, narration, diagrams, and output.

Use a terminal overlay for expected output when it helps connect code to behavior. This overlay displays supplied text; it does not execute code. Never claim an example was run or verified unless execution evidence is supplied. Prefer deterministic examples; identify scheduling assumptions rather than inventing a guaranteed ordering.

Build one small running application across chapters. State what changed and why; show enough context for the snippet to be understood. Avoid repeatedly restarting the application from scratch.

For runtime mechanisms such as a call stack or event loop, use FlowchartScene or CycleScene when their actual contracts fit. Keep names, colors, and positions consistent as a diagram develops. Simplify honestly: a generic cycle is not a complete runtime specification.

Avoid long runs of DefinitionScene and ExplainScene when code or a trace would teach the point better. Definitions still help introduce unfamiliar terms. Use an occasional prediction question at meaningful checkpoints, not after every scene. Inspect scene and overlay contracts before using their fields; do not invent animation capabilities.
