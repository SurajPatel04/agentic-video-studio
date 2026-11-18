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

Hard rules (they override softer advice):
- IsoScene is the paper look for every DIAGRAM (tech, media, business, science, history). Between diagrams, show the real thing with the scenes other guides name (editor, terminal, front page, feed, chart, timeline, map, equation). Never more than 5 IsoScenes in a row.
- Use diagrams after the lecture concept card. A comparison is two labelled groups side by side; a definition is a title + subtitle over a small scene that shows it.
- Title and chapter cards are IsoScene too, with "objects": [], "links": [], "steps": [] (ALWAYS write the three empty lists: when left out, an example diagram appears) plus eyebrow, title, subtitle and up to 4 short "points". Use at most one such card per chapter.
- Diagram scenes: a short eyebrow and title at the top; 3-5 objects (fewer objects are drawn bigger); links for what goes where; steps that follow the narration.

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
- AI media: aigeneratedlabel, aivoice, alteredimage, recommendation, verified.
- Radio, audio and podcasts: headphones, mixingconsole (sound board), boommic (arm mic), speaker (studio monitor), audiorecorder, podcastbooth (ON AIR booth).
- General: house, tree, clock (moving hands), chart (growing bars), piechart, chatbubble, sun, weather (sun and cloud), trophy, flag, lightbulb, gear (turning), magnifier, warning, checkmark, cross.
- Roads (ground slabs; vehicles on them at z: 0.12, highway 0.18): road, singlelane, twolane, fourlane, highway. Use size to lengthen or widen.
- Roles: doctor, teacher, chef, worker (hard hat), police.
- People: user (one person), people (a crowd, "count": 6-20), platform (a stage they stand on).
- For distinct concepts that built-in art would depict misleadingly, use kind "tile" with "design" set to a reusable concept ID. The designer supplies the faces and registers the artwork automatically.
- Anything else: "tile" with an "icon" - an upright card showing any Lucide icon ("megaphone", "thumbs-up", "share-2", "scale", "leaf"). Give tiles different colors.
- Labels: 1-2 words under the object.

Layout on the grid (the scene centres and scales everything itself; you only choose relative positions):
- Screen-horizontal row, left to right: [0,0], [3.5,-3.5], [7,-7], [10.5,-10.5].
- Screen column, top to bottom: [0,0], [2.5,2.5], [5,5].
- Keep objects at least 3 grid units apart; the scene rejects plans where objects cover each other and tells you which ones.
- Crowds: a "platform" (size [8, 2.6, 0.3]) with "people" standing on it (z: 0.3, at the platform's position plus [1.6, 0.35]).

Timing: sync to the words. A step takes "cue": "<word the narrator says>"; an object or link the narration introduces later takes "appearCue": "<its word>". It then happens exactly on that word. Untimed objects drop in during the first third.

Make it feel alive, matched to the narration, not decoration:
- status (0-100) shows a level pill (load, reach, trust, sales); animate it with steps ("status": 95); >= 88 turns red and pulses.
- highlight: true lifts and glows the object being talked about; set it false when the talk moves on.
- note: a short bubble (max ~8 words) naming what is happening right now; one note is on screen at a time.
- focus: true zooms the camera in on a detail; focus: false zooms back out. Use at most once per scene.
- links: flow "dots" for messages/data/money, "people" for people moving, "car" for a car driving along a route, "none" for a static relation; dashed for optional or indirect paths (feedback, influence); label for what travels ("news", "ads", "likes").
- sound: steps get a fitting sound by themselves; override only when needed: "sound": "success" | "error" | "sparkle" | "impact" | "data" | "coin" | "tick" | "lock" | "swipe" | "none".

Links must say how things really work:
- A hub (loadbalancer, router, api, tower, satellite, editor) links to EACH receiver separately: tower->tv, tower->radio. Never chain receivers (a->b->c) unless the thing really passes along.
- A reply or feedback is its own link the other way, usually dashed.

Same picture, small change -> "continue" (cheaper and smoother):
- When the next scene shows the SAME picture with a change (a server fails, a channel joins, feedback comes back), write "continue": true and list ONLY what is new: objects, links, steps, and "remove": ["id"]. The rest carries over as the previous scene ENDED, without animating in again.
- Example: {"continue": true, "objects": [{"id": "d", "kind": "phone", "label": "Phone", "at": [10.5, -3.5]}], "links": [{"from": "tower", "to": "d"}], "steps": [{"at": 0.4, "target": "d", "note": "A new channel joins"}]}
- Use chains of 2-4 continued scenes for one idea, then start a fresh picture for the next idea (a close-up, a crowd, a comparison). Writing the same layout again from scratch is rejected: use continue instead.
- Labels name the object ("Server A", "Editor"), never an event ("Request 3"): events go in step notes.

Vary the pictures: a crowd, a path, a before/after, a hub sending to many, a failure (one object turns coral and hides).

More media kinds: studiocamera, teleprompter, studiolights, controlmonitors, obvan, newsdesk (anchor desk); clapperboard, cinemaprojector, cinemascreen, filmreel, storyboard, editingtimeline, theatrestage; socialpost, scrollingfeed, videoplayer, livestream, comments, repost, notification, hashtag; productdisplay, campaignboard, sponsoredpost, adplacement, paywall, adpayment. PR: pressrelease, podium, pressconference, spokesperson, mediakit, crisiscentre. Politics: parliament, ballotbox, campaignrally, publicmeeting, protestplacard, governmentoffice. Hyphenated names work. Newsroom: reporter, interview, presspass, recorder, newshub, sourcedocs.
