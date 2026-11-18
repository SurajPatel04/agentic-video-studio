---
name: video-foundation
description: Plan any video around its audience, purpose, clear narration, appropriate
  visuals, and a meaningful ending.
metadata:
  roles:
  - planner
  category: foundation
  tags: []
  scenes:
  - StepsScene
  - TimelineScene
  - ComparisonTableScene
  - ImageScene
  visuals:
  - when: [history, historical, century, centuries, ancient, empire, dynasty, revolution, world war, civil war]
    scenes: [TimelineScene, MapScene]
  - when: [geography, continent, continents, trade route, trade routes, border, borders, migration]
    scenes: [MapScene, GlobeScene, MapTrackingScene]
  - when: [newspaper, newspapers, headline, headlines, front page, journalism, journalist]
    scenes: [FrontPageScene, NewsCycleScene]
  - when: [social media, instagram, tiktok, influencer, influencers, viral, hashtag, hashtags]
    scenes: [FeedScene, PhoneScene, SpreadScene]
  - when: [statistics, survey, market share, revenue, profit, gdp, inflation, budget, percentage, growth rate]
    scenes: [ChartScene, LiveChartScene, StatScene]
  - when: [speech, famous quote, quotation, manifesto]
    scenes: [QuoteScene]
---

Apply to any subject and genre: education, science, history, art, language, practical skills, business, advertising, storytelling, or an unfamiliar topic. Subject guides are optional supplements, not a prerequisite.

Read the full brief first. Identify the intended audience, prior knowledge, language, desired length, purpose, and what the viewer should understand, feel, or do. Distinguish format from subject: a lecture ABOUT advertising is a lecture, while an ad FOR a course is an ad. Follow explicit intent over keyword matches. For a bare topic, a concise beginner explainer is a reasonable default; do not invent product details or audience demographics. Preserve the requested language and level.

Choose structure by purpose. A lecture develops understanding with reasoning, examples, and opportunities to apply it. An explainer resolves a question through a visible mechanism. An ad communicates a relevant benefit and an honest next action. A story follows motivated events and consequences; a tutorial follows usable steps and checks. Adapt mixed formats deliberately. Do not force a quiz, sales pitch, technical diagram, or dramatic hook into every video.

Give each scene one main job and a reason to follow the preceding scene. Write narration as connected spoken explanation, not slide headings read aloud. Explain new terms in context. Match depth to the audience; do not confuse simplifying language with removing the reasoning. Use transitions that express relationships such as cause, contrast, consequence, or a change of scale.

Sound like a good teacher on YouTube, in any subject: open with a hook the viewer cares about (a problem, a question, a surprising fact), talk to the viewer ("you"), ask a question and let the next scene answer it, and follow one concrete example with real names and numbers. Say each point once, then move forward. Define a term once, in a natural sentence while it is on screen; never read "Term = meaning" aloud. Avoid hedge words ("illustrative", "conceptually") and stock phrases repeated scene after scene. Close each part with a one-line recap.

Show the real thing at least once per idea, readable on screen: the code, request and JSON (tech); the headline, post, quote or ad (media); the date and place (history); the number on a chart (business, science); the equation with a worked value (maths). A diagram explains how parts relate; the real thing proves it.

Show, don't tell: most scenes must SHOW the idea happening, not describe it in text. If the library has a scene that animates the mechanism (an algorithm, a calculation, a query, a packet, the event loop, a broadcast), use it instead of a text card or a generic diagram, and let it compute the steps. In lectures, introduce each main concept on a steady, readable card before its demonstration.

Choose visuals by what the viewer must see: steps for a procedure, a timeline for chronology, a comparison for alternatives, a diagram for relationships, a worked example for a method, a concrete scene or supplied image for a situation. Use only available component contracts and supplied assets. Do not assume missing footage, generated images, or custom animations exist. A truthful simple visual is better than an unrelated chart or decorative device icon. Keep labels and visual identities stable, show the relevant part while it is discussed, and avoid competing walls of text plus captions.

Ground factual claims in provided material when available. Distinguish established facts, interpretation, and illustrative examples. Do not fabricate citations, quotes, statistics, testimonials, product capabilities, or results. Do not claim research, testing, or code execution occurred without supplied evidence. If a critical fact is missing, avoid asserting it and make the explanation conditional where useful. A skill cannot substitute for source verification.

Before returning the scene plan, check: does it satisfy the original purpose; can the audience follow each transition; do examples actually support the claim; do visuals agree with narration; are there contradictions or repetitive filler; does the ending deliver the promised outcome? Revise weak scenes rather than adding variety for its own sake. Respect the requested duration and word budget; these are estimates until audio is measured.

For rendered readability, keep diagram node labels short and put only the essential supporting phrase inside each node. Break dense mechanisms into a stable overview and focused steps. Reserve the caption area and keep edge labels separate from cards and arrows. When output is the main evidence, present it at a readable size rather than as a small decorative overlay. Supply topic-specific text explicitly; sample abbreviations, footers, and examples from a component are not facts about the requested topic. Omit an abbreviation when the term has no useful one.
