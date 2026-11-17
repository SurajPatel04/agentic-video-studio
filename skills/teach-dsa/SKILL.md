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
  - stack data structure
  - stacks and queues
  - stack and queue
  - lifo
  - fifo
  - queue data structure
  - hash table
  - hash tables
  - hash map
  - hash maps
  - hashmap
  - hashing
  - binary tree
  - binary trees
  - bst
  - avl
  - graph
  - bfs
  - dfs
  - dijkstra
  - shortest path
  - pointers
  scenes:
  - ArrayScene
  - StackScene
  - HashScene
  - TreeScene
  - GraphScene
  - LinkedListScene
  - EditorScene
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

Use the dedicated paper-style animations (allowed even when a style guide says "every scene IsoScene"); they compute the trace for you, so the state is always correct:
- ArrayScene: "values" + "algorithm" bubble | selection | insertion | binary-search | linear-search ("target" for searches). Comparisons, swaps, i/j pointers, counters and the pseudocode line are generated. 5-8 values. Own steps only for an algorithm not listed.
- StackScene: "kind" stack | queue, steps push {value} / pop / peek. Popped items line up so LIFO vs FIFO order is visible.
- HashScene: "size", steps insert {key, value} / get / delete. The bucket is computed (letter-code sum % size): "cat" and "act" collide, show a chain.
- TreeScene: kind bst | avl (rotations animate) | tree (nested {label, children}); steps insert / delete / find / traverse {order}.
- GraphScene: nodes, edges ["A-B 4"], steps bfs / dfs {from} (queue / stack shown), dijkstra {from, to}.
- LinkedListScene: values, steps insert {value, after} / append / prepend / delete / find / reverse (pointer re-wiring shown).
Pair each with EditorScene of the real code for the same input. Never write the numbers of a trace yourself in narration that the scene does not show. End a section with a prediction or choice that tests the invariant rather than vocabulary alone.
