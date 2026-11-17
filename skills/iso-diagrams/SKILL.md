---
name: iso-diagrams
description: The house visual style for every topic - paper-style isometric scenes with real 3D objects (servers, TVs, newspapers, towers, books, people, any icon) built from IsoScene.
metadata:
  roles:
  - planner
  category: style
  tags:
  - system design
  - load balancer
  - load balancing
  - architecture
  - scaling
  - scalability
  - microservices
  - cdn
  - caching
  - cache
  - distributed
  - backend
  - infrastructure
  - isometric
  - paper style
  scenes:
  - IsoScene
  - CodeScene
  overlays: []
  long_video: false
---

Hard rules (they override softer advice, including scene suggestions from other guides):
- Build EVERY scene with IsoScene, whatever the subject (tech, media, business, science, history), so the whole video keeps one paper look. Only exceptions: real code uses CodeScene (and its output a BlankScene terminal, when a code guide asks for it); a real equation uses EquationScene.
- Show THINGS, not tables or text cards: every idea becomes objects on the paper (a TV, a newspaper, a crowd, an editor's desk, a tile with an icon). A comparison is two groups side by side with labels, not a table. A definition is a title + subtitle over a small scene that shows it.
- Title and chapter cards are IsoScene too, with "objects": [], "links": [], "steps": [] (ALWAYS write the three empty lists: when left out, an example diagram appears) plus eyebrow, title, subtitle and up to 4 short "points". Use at most one such card per chapter.
- Diagram scenes: a short eyebrow and title at the top; 2-7 objects; links for what goes where; steps that follow the narration.

Objects (kinds are drawn as what they are; pick the real thing):
- Tech: server, database, storage, cache, cloud, loadbalancer, router, api, queue, client (monitor), laptop, phone, cpu, memory, globe, lock, file, code, box.
- Media: tv, radio, newspaper, tower (broadcast), satellite, building (office), book, mic, camera, billboard.
- Health: hospital, doctor, bed, ambulance, pill, syringe, heartmonitor, microscope, testtubes, dna.
- Education: school, teacher (at a whiteboard), desk, bookshelf, gradcap, backpack, standglobe, certificate, notebook.
- Finance: bank, coins, wallet, creditcard, atm, safe, piggybank, cash, stockchart, calculator, receipt.
- Retail and business: shop, shoppingcart, conveyor (parcel on a belt), register (till), warehouse, pricetag, shoppingbag, factory, officedesk, handshake, meetingtable.
- Transport: car, truck, bus, train, airplane, ship, bicycle, trafficlight, fuelpump, mappin. Vehicles drive on a road (below); a link with "flow": "car" sends a car along a route.
- Print and publishing: printingpress, newspaperbundle, magazine, printingplates, newsstand, deliverystack.
- Communication: envelope (message), sender, receiver, encoder, decoder (message <-> signal, not encryption), feedback, noise.
- General: house, tree, clock (moving hands), chart (growing bars), piechart, chatbubble, sun, weather (sun and cloud), trophy, flag, lightbulb, gear (turning), magnifier, warning, checkmark, cross.
- Roads (ground slabs; vehicles on them at z: 0.12, highway 0.18): road, singlelane, twolane, fourlane, highway. Use size to lengthen or widen.
- Roles: doctor, teacher, chef, worker (hard hat), police.
- People: user (one person), people (a crowd, "count": 6-20), platform (a stage they stand on).
- Anything else: "tile" with an "icon" - an upright card showing any Lucide icon ("megaphone", "message-circle", "thumbs-up", "share-2", "funnel", "eye", "briefcase", "heart", "scale", "gavel", "leaf", "bell", "target"). Give tiles different colors.
- Labels are 1-2 words ("Server A", "Editor", "Audience") and sit under the object. A user's own device: client / laptop / phone with the person's name as label.

Layout on the grid (the scene centres and scales everything itself; you only choose relative positions):
- Screen-horizontal row, left to right: [0,0], [3.5,-3.5], [7,-7], [10.5,-10.5].
- Screen column, top to bottom: [0,0], [2.5,2.5], [5,5].
- Keep objects at least 3 grid units apart; the scene rejects plans where objects cover each other and tells you which ones.
- Crowds: a "platform" (size [8, 2.6, 0.3]) with "people" standing on it (z: 0.3, at the platform's position plus [1.6, 0.35]).

Timing: every "at" / "appearAt" is a FRACTION of the scene (0 = start, 1 = end), because scenes stretch to fit the narration. If the narration names something in its second half, put the step near 0.6. Objects drop in one after another during the first third by default; give a later appearAt to something the narration introduces later.

Make it feel alive, matched to the narration, not decoration:
- status (0-100) shows a level pill (load, reach, trust, sales); animate it with steps ("status": 95); >= 88 turns red and pulses.
- Intrinsic animation is automatic: clocks/gears turn, charts grow on entry, heartmonitor pulses and ambulance lights flash. Highlighting a lightbulb also lights its glass.
- highlight: true lifts and glows the object being talked about; set it false when the talk moves on.
- note: a short bubble (max ~8 words) naming what is happening right now; one note is on screen at a time.
- focus: true zooms the camera in on a detail; focus: false zooms back out. Use at most once per scene.
- links: flow "dots" for messages/data/money, "people" for people moving, "car" for a car driving along a route, "none" for a static relation; dashed for optional or indirect paths (feedback, influence); label for what travels ("news", "ads", "likes").
- sound: steps get a fitting sound by themselves (hide: remove, overload: alert, highlight: chime, focus: rise, note: blip). Override only when the moment needs another one: "sound": "success" | "error" | "sparkle" | "impact" | "data" | "connect" | "disconnect" | "coin" | "tick" | "lock" | "swipe" | ... or "none".

Links must say how things really work:
- A hub (loadbalancer, router, api, tower, satellite, editor) links to EACH receiver separately: tower->tv, tower->radio. Never chain receivers (a->b->c) unless the thing really passes along.
- A reply or feedback is its own link the other way, usually dashed.

Same picture, small change -> "continue" (cheaper and smoother):
- When the next scene shows the SAME picture with a change (a server fails, a new channel joins, the audience reacts, feedback comes back), write it with "continue": true and list ONLY what is new: new objects, new links, its steps, and "remove": ["id"] for things that leave. Everything else is carried over exactly as the previous scene ENDED (same places, colours, levels), without animating in again; only the new parts animate.
- Example: {"component": "IsoScene", "props": {"continue": true, "objects": [{"id": "d", "kind": "phone", "label": "Phone", "at": [10.5, -3.5]}], "links": [{"from": "tower", "to": "d"}], "steps": [{"at": 0.4, "target": "d", "note": "A new channel joins"}]}}
- Use chains of 2-5 continued scenes for one idea, then start a fresh picture for the next idea (a close-up, a crowd, a comparison). Writing the same layout again from scratch is rejected: use continue instead.
- Labels name the object ("Server A", "Editor"), never an event ("Request 3"): events go in step notes.

Show change over time: the same objects and ids return, and each scene adds one idea. Vary the pictures: a crowd scene, a left-to-right path, a before/after comparison of two groups, a hub sending to many receivers, a failure where one object turns coral and is hidden.
