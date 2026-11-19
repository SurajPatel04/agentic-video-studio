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
- Use IsoScene for paper-style diagrams across subjects. Show concrete artifacts in the scenes named by the other guides. Use at most 5 consecutive IsoScenes.
- Begin lectures with a concept card. Compare labelled groups side by side. For definitions, put a title and subtitle above a small illustrative diagram.
- Title and chapter cards use IsoScene with explicit `"objects": [], "links": [], "steps": []` to suppress the example diagram. Include eyebrow, title, subtitle and up to 4 short points. Use at most one such card per chapter.
- For diagrams, use a short eyebrow and title, usually 3–5 objects, directional links and steps timed to narration.
- Draw the HTTP participants. Use `kind: "server"` for the handling server, `kind: "api"` for a distinct API interface and `kind: "router"` for a network router. Write HTTP messages in `exampleLines` or link labels, such as `GET /products/42` and `200 OK`. Keep headers and JSON readable, with an editor view for long payloads.

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
- For concepts that need distinct artwork, use "tile" with "design" set to a reusable concept ID. The designer supplies and registers the artwork.
- A "tile" with "icon" can use Lucide (e.g. "megaphone") or React Icons (e.g. "react-icons/fa6/FaReact"). Search both with find_iso_objects before asking for a new design. Give tiles different colors.
- Labels: 1-2 words under the object.

Layout on the grid (the scene centres and scales everything itself; you only choose relative positions):
- Screen-horizontal row, left to right: [0,0], [3.5,-3.5], [7,-7], [10.5,-10.5].
- Screen column, top to bottom: [0,0], [2.5,2.5], [5,5].
- Keep objects at least 3 grid units apart; the scene rejects plans where objects cover each other and tells you which ones.
- Crowds: a "platform" (size [8, 2.6, 0.3]) with "people" standing on it (z: 0.3, at the platform's position plus [1.6, 0.35]).

Sync to narration words with "cue" on steps and "appearCue" on objects and links. Untimed objects drop in during the first third.

Make it feel alive, matched to the narration, not decoration:
- status (0-100) shows a level pill (load, reach, trust, sales); animate it with steps ("status": 95); >= 88 turns red and pulses.
- highlight: true lifts and glows the object being talked about; set it false when the talk moves on.
- note: a short bubble (max ~8 words) naming what is happening right now; one note is on screen at a time.
- focus: true zooms the camera in on a detail; focus: false zooms back out. Use at most once per scene.
- links: use flow "dots" for messages, data or money, "people" or "car" for movement, and "none" for static relations. Label what travels. Use dashed links for optional or indirect paths.
- sound: steps get a fitting sound by themselves; override only when needed: "sound": "success" | "error" | "sparkle" | "impact" | "data" | "coin" | "tick" | "lock" | "swipe" | "none".

Links must say how things really work:
- A hub (loadbalancer, router, api, tower, satellite, editor) links to EACH receiver separately: tower->tv, tower->radio. Never chain receivers (a->b->c) unless the thing really passes along.
- A reply or feedback is its own link the other way, usually dashed.

Same picture, small change -> "continue" (cheaper and smoother):
- For a change to the same diagram, set "continue": true and provide just the new objects, links, steps and "remove": ["id"]. The prior end state carries over fully visible.
- Example: {"continue": true, "objects": [{"id": "d", "kind": "phone", "label": "Phone", "at": [10.5, -3.5]}], "links": [{"from": "tower", "to": "d"}], "steps": [{"at": 0.4, "target": "d", "note": "A new channel joins"}]}
- Continue for 2–4 scenes on one idea, then open a fresh diagram for the next idea.
- Name objects in labels ("Server A", "Editor") and events in step notes.

Vary the layouts with a crowd, path, before/after, hub or a failure.

More media kinds: studiocamera, teleprompter, studiolights, controlmonitors, obvan, newsdesk (anchor desk); clapperboard, cinemaprojector, cinemascreen, filmreel, storyboard, editingtimeline, theatrestage; socialpost, scrollingfeed, videoplayer, livestream, comments, repost, notification, hashtag; productdisplay, campaignboard, sponsoredpost, adplacement, paywall, adpayment. PR: pressrelease, podium, pressconference, spokesperson, mediakit, crisiscentre. Politics: parliament, ballotbox, campaignrally, publicmeeting, protestplacard, governmentoffice. Hyphenated names work. Newsroom: reporter, interview, presspass, recorder, newshub, sourcedocs.
