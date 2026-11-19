---
name: teach-lecture
description: Build study lectures in any subject with prerequisites, reasoning, worked
  examples, and useful practice.
metadata:
  roles:
  - planner
  category: format
  tags:
  - lecture
  - lesson
  - study
  - teach
  - teaching
  - class
  - exam
  - course
  - tutorial
  scenes:
  - ExplainScene
  - AnnotatedTextScene
  - OutcomeComparisonScene
  - StepsScene
  - WorkedExampleScene
  - LayersScene
  - MatrixScene
  - ImageScene
  - FactCheckScene
  - CaseStudyScene
  - ProfileScene
  - AnalogyScene
  - ConceptMapScene
  - TreeScene
  - GitGraphScene
  - ExampleCardScene
  - QuizScene
  - SummaryScene
---

Apply to lessons, lectures, study sessions and instructional tutorials. Follow the requested format and audience. Give the learner one achievable outcome and order ideas from prerequisites to application. Begin with a concrete situation. For a first API lesson, show an app asking a server for something and getting an answer, then define the terms the learner needs.

Open each chapter with a short, readable ExplainScene, optionally after a title. Set textAnimation to none and startAt to zero. Introduce each main idea in plain language, then develop the same example. Teach definitions in context. Explain why a calculation, decision or interpretation follows from the evidence, using the same values and terms in the narration and visuals.

Use AnnotatedTextScene when reading a request, equation or passage. Keep the complete example visible and highlight the exact part being explained. Editor layout indents a valid JSON body beneath its HTTP request line. Use OutcomeComparisonScene for two comparable examples. Align the shared parts, highlight the difference and reveal each outcome when spoken. Use resultsOnCue and a hidden second row when appropriate. Continue the existing comparison or isometric board with continue:true and only the changes. Use a brief cross-dissolve by default when moving to a different board.

Choose a layout by what it makes visible:
- LayersScene: funnel for narrowing stages such as AIDA or sales, pyramid for Maslow, inverted for news writing, and equal-width stack for OSI. Put levels in screen order from top to bottom. Only use count-based funnel widths when every stage has a comparable value. Cue the levels in order.
- MatrixScene: use quadrant for two labeled axes and spectrum for one. Place and move concrete examples with narration cues. Explain what a position means and use a source for factual ratings.
- ImageScene: when the source image is available, add hotspots with normalized x/y from its top-left and cue each short label or explanation. Use contain to keep the whole image visible. For ad anatomy or a UI walkthrough, point to the actual source feature.
- FactCheckScene: keep the claim visible while revealing source-attributed evidence. Give the verdict and explain its limits. Use unverified when the evidence is insufficient and label illustrative claims and evidence.
- CaseStudyScene: hold the goal, strategy, measured result and lesson on one board. Include units, a baseline and a source where appropriate. Label fictional examples and avoid claiming the strategy caused an observed change without supporting evidence.
- ProfileScene: show a relevant person, character or audience segment with a short role and facts that explain their choices. Label composite personas as illustrative.
- AnalogyScene: pair the familiar with the new. Cue each matching pair and explain where the analogy breaks down.
- ConceptMapScene: use radial branches for an overview or labeled relationships for cause, dependency or meaning. Use TreeScene with kind tree for a company or newsroom reporting hierarchy.
- GitGraphScene: show a few commits, their true parents, named branches and HEAD. A merge points to both parents. For rebase or cherry-pick, assign new IDs and update the refs when the narration explains the change.

In an IsoScene worked example, put the evidence in exampleLines beside the diagram. Keep the first line visible from frame zero and cue later lines. Give each new object an appearCue and keep a starting object visible. Show a message or result on its arrow or beside the recipient. For an HTTP read, retrieve the existing record from the catalog and send the JSON to the client. In a rejected write, validate first and return the error before any creation. In pagination, keep the first response visible when using its cursor in the next request.

Use WorkedExampleScene for selecting or changing a row and for intermediate calculations. Keep the starting input, each important step and the result visible on its spoken cue. Show the selected row or failing lookup. A title or closed database icon alone cannot show a calculation or its evidence. Label predictions and visually distinguish them from observed values.

Give the learner a short checkpoint when it helps. Ask them to predict, retrieve or apply the idea, allow time to inspect it, then show and explain the answer. Close by applying the main ideas to the original problem. In a long lecture, bridge to the next chapter. Check that someone with the stated prerequisites could follow the reasoning from the narration and visuals together.
