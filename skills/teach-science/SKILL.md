---
name: teach-science
description: Explain science, the human body, nature and machines with simple flat 2D diagrams drawn in DrawScene (parts, arrows and motion on narration cues).
metadata:
  roles:
  - planner
  tags:
  - science
  - biology
  - chemistry
  - physics
  - human body
  - anatomy
  - organ
  - heart
  - blood
  - lungs
  - breathing
  - digestion
  - cell
  - cells
  - plant
  - plants
  - photosynthesis
  - ecosystem
  - food chain
  - atom
  - atoms
  - molecule
  - electron
  - chemical reaction
  - combustion
  - acid
  - engine
  - piston
  - machine
  - motor
  - gear
  - gears
  - lever
  - pulley
  - force
  - gravity
  - friction
  - magnet
  - magnetism
  - battery
  - light bulb
  - energy
  - heat
  - evaporation
  - weather
  - volcano
  - earthquake
  - solar system
  - planet
  - planets
  scenes:
  - DrawScene
  - CycleScene
  - StepsScene
  - ComparisonTableScene
  - QuizScene
  overlays: []
  long_video: false
---

Teach the mechanism, not the vocabulary: show the thing, then show what moves through it or what changes, one idea at a time.

Draw it with DrawScene: a flat 2D diagram on a 100 x 56 grid (x 0 left to 100 right, y 0 top to 56 bottom). You only place parts and say what happens; the scene draws, labels and animates them. Keep it simple and clear like a school textbook, never realistic.

Layout recipe:
- The main thing in the middle, about [50, 26]. Inputs on the left (x about 15), outputs on the right (x about 85), things above at y about 10, below at y about 44. Keep y at most 50: a note caption sits at the bottom.
- 4 to 10 shapes. Keep about 10 grid units between centres. size 6 to 16; the main part up to 30.
- Use the ready-made parts: heart, cell, atom, leaf, tree, sun, cloud, drop, flame, bubble, piston, cylinder, gear, wheel, spring, battery, bulb, magnet, planet, person, house, mountain, wave, flask. Use a box with a label for a named region (a heart chamber, a stomach, a factory step). Use "icon" for anything else.
- Connect with arrows by id: {"kind": "arrow", "at": "lungs", "to": "heart"}. Add "bend" (-20 to 20) to curve around other shapes.

Movement:
- motion "flow" on an arrow for what travels: blood, water, air, current, food.
- "spin" for gears and wheels, "bob" with "amount" for a piston, "pulse" for a beating heart, "orbit" with "around" for electrons and planets.

Timing: one step per idea, with "cue" set to exact words from that scene's narration, in spoken order. Use do "show" for something new, "focus" to point at it, "move" to carry it to a new place, "color" for a change of state (blue blood turns red). Add a short "note" when a caption helps.

Build a process over several scenes: keep the same shapes and positions from scene to scene and add or focus one new thing each time, so the viewer sees one diagram grow. Say in the narration what the viewer sees on screen.
