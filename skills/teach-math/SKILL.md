---
name: teach-math
description: Explain mathematics with worked examples, visual intuition, and justified
  steps.
metadata:
  roles:
  - planner
  tags:
  - math
  - maths
  - mathematics
  - algebra
  - calculus
  - probability
  - equation
  - geometry
  - theorem
  - formula
  - pythagoras
  - trigonometry
  - statistics
  - fraction
  - fractions
  - percentage
  - derivative
  - integral
  - matrix
  - graphing
  - plot
  - parabola
  - quadratic
  - linear function
  - slope
  - exponential
  - compound interest
  - interest rate
  - growth rate
  - sine wave
  scenes:
  - EquationScene
  - PlotScene
  - LiveChartScene
  - ChartScene
  - StepsScene
  - QuizScene
  overlays: []
  long_video: false
---

Introduce the question or quantity before its notation. Define symbols and units once, then keep them consistent across equations, diagrams, and narration.

Connect visual intuition to a small worked example. Show intermediate steps where the reasoning changes; explain why each transformation is permitted. State domain restrictions and assumptions. Distinguish examples, approximations, and proofs.

Animate the calculation instead of stating it. The scenes compute every number from the formula, so never type results yourself:
- PlotScene: a graph of y = f(x). "curves": ["a*x^2 + b"] (use * ^ and brackets), "params": {"a": 1, "b": 0}, "x": [min, max]. Steps: {"do": "set", "a": 3, "note": ...} morphs the curve while the slider moves; trace {x}, mark {x}, tangent {x} (slope), area {from, to} (integral), zoom {x}. Change one parameter per step and say what changed.
- LiveChartScene: numbers in a bar, line or race chart that change. Use a "formula" over a range ("P*(1 + r)^t", "var": "t", "from": 0, "to": 10, "params") or "data". Steps: reveal (bars grow one by one), set {"r": 0.1} (every bar is recalculated), set/add/scale values, sort, highlight {label}. Good for growth, interest, budgets and before/after.
Both are paper style and allowed with the house style.

Use EquationScene or charts only within their supported contracts. Match chart scales and labels to the numerical example. Prefer a clear sequence of supported scenes over an invented symbolic animation.

Include a common misconception or boundary case and a short prediction checkpoint when useful. Do not substitute formula lists for an explanation of when and why the method applies.
