---
name: write-scene
description: Design a reusable educational scene with clear state, deterministic motion,
  and readable props.
metadata:
  roles:
  - component
  tags:
  - scene
  - component
  - animation
  - diagram
  scenes: []
  overlays: []
  long_video: false
---

Identify the teaching operation the scene must make visible: a comparison, state change, path, or causal sequence. Expose the meaningful data and presentation controls through the existing scene contract, with defaults that render a useful example.

Reuse project layout, theme, typography, and motion helpers after inspecting their implementations. Derive all animation state from the frame; avoid timers, nondeterministic randomness, external requests, and side effects during rendering.

Design states that remain understandable when narration stretches the scene. Hold the final result rather than looping distractingly. Keep labels readable at normal video size, avoid caption areas, and handle plausible short and long inputs without clipping.

Prefer semantic input props over hardcoded topic-specific text. Document limitations through the schema and description; do not claim unsupported visual behavior. Follow the component agent's existing validation and preview workflow, and inspect beginning, middle, and final states before finishing.
