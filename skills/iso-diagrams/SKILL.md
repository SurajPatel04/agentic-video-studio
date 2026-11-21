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
- Use IsoScene for paper-style diagrams, up to 5 in a row. Show concrete artifacts in the scenes named by the other guides.
- Open lectures with a concept card. Compare labelled groups side by side. Diagram definitions that depend on relationships.
- For an IsoScene title card, leave objects, links and steps empty.
- For diagrams, use a short eyebrow and title, usually 3–5 objects, directional links and steps timed to narration.
- Draw HTTP participants as client, server or a distinct API interface. Use router for a network router. Label outgoing arrows with the request (e.g. `GET /products/42`). Use `http-get`, `http-post`, `http-put`, `http-patch`, `http-delete`, `http-head` or `http-options` when teaching the verb itself.
- Show a written HTTP response with its status once beside the full JSON. Label the return arrow `Response` when the example shows the status. Use an editor view for long payloads.

Objects (kinds are drawn as what they are; pick the real thing):
- Tech: server, database, storage, cache, cloud, loadbalancer, router, api, queue, client (monitor), laptop, phone, cpu, memory, globe, lock, file, code, box, table (database records: rows and columns next to a database; set "table").
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
- General: house, tree, clock (moving hands), chart (growing bars), piechart, chatbubble, sun, weather (sun and cloud), trophy, flag, lightbulb, gear (turning), magnifier, warning, checkmark, cross, mug (coffee cup, a concrete product).
- Roads (ground slabs; vehicles on them at z: 0.12, highway 0.18): road, singlelane, twolane, fourlane, highway. Use size to lengthen or widen.
- Roles: doctor, teacher, chef, worker (hard hat), police.
- People: user (one person), people (a crowd, "count": 6-20), platform (a stage they stand on).
- For concepts that need distinct artwork, use "tile" with "design" set to a reusable concept ID. The designer supplies and registers the artwork.
- For a group of items or records, use `{"kind":"tile","design":"collection"}`. In a collection-to-item diagram, link it to one representative item. Use `{"kind":"tile","design":"watch"}` for an individual watch.
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
- Set `"continue": true` and supply only new objects, links, steps and IDs to remove. The previous end state stays visible.
- Continue a diagram across 2–4 scenes on one idea. Vary layouts with crowds, paths, before/after comparisons, hubs or failures.

More media kinds: studiocamera, teleprompter, studiolights, controlmonitors, obvan, newsdesk (anchor desk); clapperboard, cinemaprojector, cinemascreen, filmreel, storyboard, editingtimeline, theatrestage; socialpost, scrollingfeed, videoplayer, livestream, comments, repost, notification, hashtag; productdisplay, campaignboard, sponsoredpost, adplacement, paywall, adpayment. PR: pressrelease, podium, pressconference, spokesperson, mediakit, crisiscentre. Politics: parliament, ballotbox, campaignrally, publicmeeting, protestplacard, governmentoffice. Hyphenated names work. Newsroom: reporter, interview, presspass, recorder, newshub, sourcedocs.
