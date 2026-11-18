---
name: teach-code
description: Teach programming with small code examples, expected output, and runtime
  diagrams.
metadata:
  roles:
  - planner
  tags:
  - programming
  - coding
  - source code
  - javascript
  - node.js
  - nodejs
  - python
  - typescript
  - api
  - npm
  - libuv
  - v8
  - git
  - terminal
  - command line
  - docker
  - debugging
  - bug
  - deploy
  - event loop
  - async
  - promise
  - promises
  - callback
  - settimeout
  - call stack
  - heap
  - garbage collection
  scenes:
  - EditorScene
  - TerminalScene
  - EventLoopScene
  - FlowchartScene
  - CycleScene
  - QuizScene
  overlays:
  - terminal
  visuals:
  - when: [event loop, async, await, promise, promises, callback, callbacks, settimeout, concurrency, call stack, non blocking]
    scenes: [EventLoopScene]
  - when: [heap, garbage collection, memory leak]
    scenes: [EventLoopScene]
  - when: [rest, rest api, restful, endpoint, endpoints, http method, status code, json response, api design, pagination, curl]
    scenes: [TerminalScene, EditorScene]
  long_video: false
---

Hard rules for programming topics (they override softer advice below; EditorScene and TerminalScene are allowed even when a style guide says "every scene IsoScene"):
- Follow the planner's code requirements for this chapter or standalone video. When teaching implementation, show the code that produces the behavior using the running example. Choose diagrams and concrete examples when the goal is conceptual.
- EditorScene when code is written, changes, or breaks: "code" is the file before, then actions: type (adds lines; "line" = insert after), suggest (autocomplete: items + pick), error (line + message: red underline), fix (line + new text), highlight (line), run (text = output, variant success/error; the mouse clicks Run and the output panel opens). Line numbers mean the file at that moment. To walk through finished code, use EditorScene with no typing: the full "code" plus highlight actions on the lines being explained (it matches the paper style; avoid the dark CodeScene).
- EditorScene and TerminalScene take "device": "window" (default), "laptop", "monitor" or "browser" (online editor / web shell, with "url").
- TerminalScene for commands and their output (git, npm, pip, docker, deploys, tests): actions run (one command), output (lines, variant muted/success/error/warn/info), progress (label + seconds), done (text + variant success/error), clear. Show output in the scene right after the code that produces it.
- APIs: show each endpoint as a real call: TerminalScene with the curl command, the status line and the JSON body; EditorScene for a response shape, an error body or the handler. Put a good and a bad response side by side.
- Never more than 2 DefinitionScene / ExplainScene in a row; break them with code, a diagram, or a comparison.
- Pattern for an implementation walkthrough: EditorScene (what we write) -> IsoScene or a diagram (what the runtime does) -> TerminalScene or the editor's run (what we see).
- Debugging story: EditorScene run fails (variant error) -> error on the line -> fix -> run succeeds. Match each action to the narration.

Teach observable behavior before introducing terminology. For executable concepts, use a small EditorScene example (usually 5–12 readable lines), highlight the relevant lines, and explain what the viewer should notice. Keep identifiers and inputs consistent between code, narration, diagrams, and output.

Terminal and editor output is supplied text; nothing is executed. Never claim an example was run or verified unless execution evidence is supplied. Prefer deterministic examples; identify scheduling assumptions rather than inventing a guaranteed ordering.

When the lesson includes implementation across chapters, build one small running application. State what changed and why; show enough context for the snippet to be understood. Avoid repeatedly restarting the application from scratch.

HARD RULE: async, the event loop, callbacks, promises, concurrency or the call stack (also in comparisons with Python) MUST be shown with an EventLoopScene; an IsoScene diagram does not replace it. A trace of the same running example beats "preset": "event-loop".

For runtime mechanisms use EventLoopScene (paper style): code with the running line, call stack frames with local vars, heap objects (a var with value "@id" draws a reference arrow), Node/Web APIs, microtask and task queues, console. It is a trace YOU write step by step: call, return, log, api {id, callback}, done {id}, queue {to: micro|task}, tick (stack must be empty; microtasks all run before the next task), alloc {id, fields, var}, set, free; give "line" on steps. Pair it with the EditorScene of the same code. Each "log" must match the real output order (e.g. A D C B for log / setTimeout 0 / Promise.then / log). Without steps, "preset": "event-loop" or "memory" (stack vs heap, GC) plays a ready example. Keep names consistent; simplify honestly (Node has more phases than one task queue).

Avoid long runs of DefinitionScene and ExplainScene when code or a trace would teach the point better. Definitions still help introduce unfamiliar terms. Use an occasional prediction question at meaningful checkpoints, not after every scene. Inspect scene and overlay contracts before using their fields; do not invent animation capabilities.
