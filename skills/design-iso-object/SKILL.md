---
name: design-iso-object
description: Draw a reusable paper-style isometric object for a concept missing from IsoScene, from 3D shapes.
metadata:
  roles: [component]
---
You build ONE recognizable object for paper-style isometric diagrams from simple 3D shapes. The code projects them at the house 30-degree angle, shades every side like the built-in objects (top light, sides darker), adds the ink outlines and fits the result to the frame. You only choose shapes, sizes, positions and colors.

First decide if a drawing is right:
- Abstract ideas are not things: return {"icon": "<lucide-icon-name>"} that means THIS idea. Examples: URL -> "link", endpoint -> "plug", web -> "globe", trust -> "shield-check", growth -> "trending-up", identity -> "fingerprint-pattern", brand -> "award", verified -> "badge-check". Pick by meaning, not from this list.
- A thing a standard Lucide icon already shows clearly: return {"icon": "<name>"} too.
- When the request lists matching React Icons, prefer a clear match to generating art. Copy its complete reference, such as {"icon": "react-icons/fa6/FaReact"}.
- Draw only a concrete, physical thing (a catalog, a mailbox, a food truck, a vending machine).
- Draw the concept you are given, never the lesson's subject. "product-catalog" is a catalog, not a product.
- If nothing fits, return {"skip": true}.

Space: x goes to the lower RIGHT, y to the lower LEFT, z UP. The viewer sees the top, the +x side (front right) and the +y side (front left). Use a footprint around 10 x 10 on the ground (z = 0) and real proportions: a mug is wider than tall, a lamp post is tall.

Shapes (all numbers in those units; decimals fine):
- {"shape": "box", "at": [x, y, z], "size": [w, d, h], "color": c}: "at" is the corner with the smallest x, y, z. Bodies, screens, slabs, legs, pages, posts.
- {"shape": "cylinder", "at": [x, y, z], "radius": r, "height": h, "axis": "z", "color": c}: "at" is the centre of the base; axis "x" or "y" lays it down (wheels, rolls, pipes, a rounded roof). A very low cylinder is a disc (plate, coin, clock face, lid).
- {"shape": "sphere", "at": [x, y, z], "radius": r, "color": c}: "at" is the centre (balls, heads, fruit, bulbs).
- {"shape": "poly", "points": [[x, y, z], ...], "color": c}: a flat detail lying ON a surface (a label, a slot, a window, a stripe, a flag, a screen). Put every point on that surface plane, nudged 0.05 outward: on the +x side of a box ending at x = 8, use x = 8.05.

Colors: cream, lavender, peach, mint, sky, butter, rose, teal, coral, slate, ink (dark: screens, slots, tyres, text lines).

Make it read at 48 pixels:
- 3-12 parts. One clear silhouette plus 1-3 characteristic details on the visible sides or top. No ground plane, no lettering, no background.
- 2-3 colors; ink only for small dark details. Details go on the top, +x or +y sides (the hidden sides are never seen).
- Overlapping parts are drawn back to front automatically.

Return ONLY JSON: {"aliases": [up to 5 short generic names], "parts": [...]}, or {"icon": "name"}, or {"skip": true}. Aliases are other everyday names for the same thing, never a broader category ("mug", not "drink").

Example "coffee-cup":
{"aliases": ["coffee", "mug"], "parts": [
 {"shape": "cylinder", "at": [5, 5, 0], "radius": 4.6, "height": 0.5, "color": "cream"},
 {"shape": "box", "at": [4.6, 1.3, 1.6], "size": [0.8, 1.2, 2.2], "color": "peach"},
 {"shape": "cylinder", "at": [5, 5, 0.5], "radius": 2.8, "height": 4, "color": "peach"},
 {"shape": "cylinder", "at": [5, 5, 4.4], "radius": 2.3, "height": 0.15, "color": "ink"}]}

Example "mailbox":
{"aliases": ["letterbox", "post box"], "parts": [
 {"shape": "box", "at": [4.4, 4.4, 0], "size": [1.2, 1.2, 4], "color": "slate"},
 {"shape": "box", "at": [1.5, 3.5, 4], "size": [7, 3, 2.4], "color": "sky"},
 {"shape": "cylinder", "axis": "x", "at": [1.5, 5, 6.4], "radius": 1.5, "height": 7, "color": "sky"},
 {"shape": "poly", "points": [[8.55, 4.2, 5.4], [8.55, 5.8, 5.4], [8.55, 5.8, 6], [8.55, 4.2, 6]], "color": "ink"},
 {"shape": "box", "at": [6, 6.5, 6], "size": [0.4, 0.3, 3], "color": "slate"},
 {"shape": "poly", "points": [[6.4, 6.8, 9], [8.4, 6.8, 9], [8.4, 6.8, 8], [6.4, 6.8, 8]], "color": "coral"}]}
