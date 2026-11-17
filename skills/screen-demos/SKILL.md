---
name: screen-demos
description: Show what a user does on a website or app (open a page, click, type, sign in, search, buy) with ScreenScene, then what happens behind the scenes with IsoScene.
metadata:
  roles:
  - planner
  category: subject
  tags:
  - website
  - web app
  - web page
  - browser
  - app
  - login
  - log in
  - sign in
  - sign up
  - signup
  - checkout
  - online shopping
  - form
  - button
  - click
  - user interface
  - ui
  - ux
  - saas
  - dashboard
  - password
  - account
  - mobile app
  - phone app
  - smartphone
  - otp
  - one-time password
  - push notification
  - notification
  - upi
  - mobile payment
  - two-factor
  - chatbot
  - chatgpt
  - ai assistant
  - rag
  - customer support
  - whatsapp
  - messaging
  - sign-up form
  - input validation
  - form validation
  scenes:
  - ScreenScene
  - PhoneScene
  - ChatScene
  - FormScene
  - IsoScene
  overlays: []
  long_video: false
---

Use ScreenScene (same paper look as IsoScene) whenever the narration describes what a person does or sees on a screen. It is allowed alongside IsoScene even when a style guide says "every scene IsoScene".

How to write one:
- "device": laptop (default), monitor, phone or browser. "url" is the address bar.
- "pages": one or more pages, each {"id", "url", "blocks"}. Blocks top to bottom: nav (label = site name, items = links, button), hero (label, text, button, image: true), heading, text, image, cards (items: [{id, label, text, icon}]), card, button (label), input (label, placeholder, mask: true for passwords), list (items), banner (variant success/error/info), footer. Keep a page to 3-5 blocks so it fits the screen.
- Give an "id" to every block or item the script points at, and name only ids that are on the page shown at that moment.
- "actions" (at = fraction of the scene, in order): move / hover / click (to), type (to an input, text), scroll (to or by), navigate (page: another page's id; it loads for ~0.7 s), highlight (to), toast (text, variant), focus (to: zoom in) and unfocus. Leave ~0.1 between a pointer action and the next so the mouse can travel.
- One idea per scene: 3-7 actions. Match the narration: the click happens when the narration says "clicks".

Pattern for "what happens when I click" (best): ONE ScreenScene with "diagram" - the screen on the left, the process on the right, same timeline. "diagram" takes IsoScene props (objects, links, steps; no title). Make the right side react to the left: the object/link after the click gets "appearAt" just after the click's "at", steps follow it to the server and back, and the toast on the left lands when the reply link reaches the device. Use 2-4 objects in a row ([0,0], [3.5,-3.5], [7,-7]).
For a longer journey (many hops), use separate scenes instead: ScreenScene (end on the click) -> IsoScene (the request travels) -> ScreenScene "instant": true on the result page. Never leave "actions" empty: highlight the outcome, then move/hover to what comes next.

Example: {"component": "ScreenScene", "props": {"title": "Signing in", "url": "shop.example.com/login", "page": [{"type": "heading", "label": "Welcome back"}, {"id": "email", "type": "input", "label": "Email", "placeholder": "you@example.com"}, {"id": "go", "type": "button", "label": "Sign in"}], "actions": [{"at": 0.2, "do": "type", "to": "email", "text": "mira@mail.com"}, {"at": 0.6, "do": "click", "to": "go"}, {"at": 0.7, "do": "toast", "text": "Signed in", "variant": "success"}]}}

PhoneScene for anything on a phone (mobile apps, OTP logins, payments, push notifications, chats):
- "screens": [{"id", "type": "home", "apps": [{id, label, icon, color}]}] and app screens {"id", "blocks"}. Blocks: header (label, icon "arrow-left"), heading (label, text), text, image, amount (label, value), input (label, placeholder, mask, digits: 4-8 for OTP/PIN boxes), button, list, cards, chat (items {label, me: true for my side}), banner, tabs (bottom bar items).
- Actions: tap (to), type (to input, text; a keyboard slides up), swipe (direction; left/right with "to" slides that row away), open (screen; after tapping an app icon it zooms open), back, notify (title, text), otp (to: digits input, text: code, title: sender; the SMS drops in and fills the boxes), wait (text, seconds: spinner), highlight, toast, focus/unfocus. Add "note" (2-5 words) to the key actions: they show as ticking steps beside the phone.

Devices: ChatScene, FormScene, EditorScene and TerminalScene take "device": "laptop", "monitor", "browser" (web page with "url"), "window" or "phone" (chat and form only; FormScene also "card"). Pick what the story uses: a phone for apps and WhatsApp, a laptop or browser for websites and work.

Chat widget on a website: give ScreenScene "chat": {"name", "messages": [...] like ChatScene} - a bubble sits in the corner of the page; an action {"do": "click", "to": "chat"} opens it (or it opens just before the first message) and the conversation plays inside the page.

ChatScene for conversations: "look": "assistant" (chatbot / AI / support) or "messenger" (people texting), "name" (the other side), "messages": [{at, from: "me"|"them", text, sources: ["policy.pdf"] for RAG answers, highlight}]. My messages are typed into the box and sent; theirs show typing dots, AI replies stream word by word. 2-5 messages per scene.

FormScene for filling in forms and validation: "heading", "button", "fields": [{id, label, type: text|email|password|phone|number|date|url|textarea|checkbox|select, placeholder, prefix: "+91" for phone, strength: true for a password meter}], "actions": type (to, text), check (to), submit (errors: [{to, text}] to reject; no errors + text = success card), error (to, text: live check), highlight. Story: type -> submit -> errors shake -> retype (only the added part is typed) -> submit -> success. A successful submit must come after every error is fixed.

Use made-up site names (Shoply, Notely), never real company logos or brands.
