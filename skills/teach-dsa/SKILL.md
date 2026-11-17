---
name: teach-dsa
description: Teach algorithms and data structures with traced examples, invariants,
  and complexity.
metadata:
  roles:
  - planner
  tags:
  - dsa
  - algorithm
  - algorithms
  - sorting
  - sort
  - binary search
  - linked list
  - data structures
  - recursion
  - tree traversal
  scenes:
  - CodeScene
  - StepsScene
  - FlowchartScene
  - ChartScene
  - QuizScene
  overlays: []
  long_video: false
---

Choose one small input that reveals the algorithm's interesting behavior. Show the initial state, a few meaningful operations, and the result. Keep values, indices, pointers, and colors consistent across the trace.

Explain the invariant or decision behind each operation, not just the movement. Pair concise pseudocode or CodeScene with visible state when it clarifies the mechanism. Distinguish conceptual pseudocode from executable code.

Include a revealing edge case after the main example. Derive complexity from the work performed and state the input size, case, and assumptions. Avoid presenting a few measured timings as proof of asymptotic complexity.

Prefer a dedicated animation only if its actual contract represents the algorithm. Otherwise use supported steps, code, and diagrams; never pretend arbitrary arrays or pointer animations are available. End a section with a prediction or choice that tests the invariant rather than vocabulary alone.
