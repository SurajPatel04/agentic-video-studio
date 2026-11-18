---
name: teach-media
description: Teach mass communication, journalism, media, advertising, public relations and marketing with concrete senders, channels and audiences.
metadata:
  roles:
  - planner
  category: subject
  tags:
  - mass communication
  - communication
  - media
  - mass media
  - journalism
  - journalist
  - news
  - newspaper
  - broadcasting
  - broadcast
  - television
  - radio
  - film
  - social media
  - advertising
  - advertisement
  - public relations
  - marketing
  - brand
  - audience
  - agenda setting
  - gatekeeping
  - propaganda
  - press
  scenes:
  - IsoScene
  - NewsCycleScene
  - FrontPageScene
  - PrintDeliveryScene
  - FeedScene
  - SpreadScene
  - CreatorWorkflowScene
  - MediaTheoryScene
  - StudioScene
  - SignalHomesScene
  - RadioTuningScene
  - SatelliteNewsScene
  overlays: []
  long_video: false
---

Teach media as people and things doing something: a sender makes a message, a channel carries it, an audience receives and reacts. Every idea should be visible as objects, never as a table of terms.

Pick ONE running story the viewer knows (a storm warning, a new phone launch, an election, a local festival) and follow it through the whole video, so each concept is a new view of the same story.

Picture vocabulary (IsoScene kinds):
- Communication model: sender, encoder, envelope, decoder, receiver, feedback, noise are dedicated objects. Use links for message transmission, a return path for feedback, and a dashed noise-to-channel/message link for interference. Encoding is broader than binary conversion; noise can be physical, semantic, or contextual.
- Senders: building (newsroom, studio, company), user (reporter, editor), mic, camera.
- Channels: newspaper, radio, tv, tower (broadcast), satellite, phone / laptop (internet and social media), billboard (ads), book (print), tile with "film" / "clapperboard" (cinema).
- Audience: people on a platform (mass audience), a single user (personal communication).
- Ideas: tile with an icon - "funnel" (gatekeeping), "megaphone" (persuasion / ads), "message-circle" (feedback), "thumbs-up" / "share-2" (social reactions), "eye" (attention), "lightbulb" (educate), "smile" (entertain), "zap" (noise), "briefcase" (careers).
- AI and emerging media: aigeneratedlabel (a post card with an AI badge), aivoice (a talking robot with a speech bubble), alteredimage (before/after photos with a slider), recommendation (a FOR YOU feed with one boosted card), verified (photo with a check seal and a source/date/place checklist).
- Audio and podcasts: headphones, mixingconsole (sound board with knobs and faders), boommic (articulated arm and hanging capsule), speaker (studio monitor), audiorecorder (REC screen and XLR inputs), podcastbooth (foam walls, an ON AIR sign, a table, two mics and headphones). Use podcastbooth for the studio, audiorecorder for field reporting, and headphones or speaker for the listener.

Conversations: ChatScene (look "messenger") for word of mouth, rumours and forwarded messages, group chats, feedback from one person; PhoneScene for push notifications and news alerts.

Concept recipes:
- Personal vs mass: one user -> one user (a phone call) next to one tower -> a big crowd; same message, different reach (status as reach).
- Communication model: sender -> message -> channel -> receiver, then a dashed feedback link back; noise as a coral noise object connected by a dashed link to the message.
- Evolution of media: a continue chain that adds newspaper, then radio, then tv, then phone in front of the same crowd, each with a short note (year).
- Functions (inform, educate, entertain, persuade): one tv sending to four tiles (newspaper, lightbulb, smile, megaphone) in a row, highlighted one by one.
- Agenda-setting: a tv repeating one story (status rising on that story tile) while the crowd's attention ("eye" tile) follows it.
- Gatekeeping: many story tiles flow into an editor ("funnel" tile or user labelled Editor); only some links continue to the newspaper.
- Careers: a row of user objects labelled Journalist, Advertiser, PR, Broadcaster, Creator, each next to their tool (mic, billboard, megaphone tile, camera, phone).
- AI and emerging media: one post card with aigeneratedlabel beside a aivoice robot, an alteredimage comparison, a recommendation feed and a verified panel; use steps to walk through the checks a viewer can make (label, original image, source trail) instead of claiming a detector is perfect.
- Podcast production: podcastbooth in the centre, boommic and headphones beside it, then audiorecorder and mixingconsole linked in a record → edit → publish chain; finish with a speaker for the listener. Use steps to name each stage.

Use real examples, but don't invent statistics, dates or quotes; keep claims general when unsure.

News and journalism animations (prefer these for complete sequences):
- `NewsCycleScene`: event → reporter with mic → editor / funnel → publication → audience reactions. Set `event`, `output` (`print` or `broadcast`) and `stories` (`label`, `selected`).
- `FrontPageScene`: an empty newspaper builds headline, illustrated photo and text columns; the editor changes the lead story’s size. Set `masthead`, `headline`, `photoCaption`, `stories` and `leadShare` (0.5–0.72).
- `PrintDeliveryScene`: rolling press → stacking papers → van along a road → doorstep deliveries. Set `masthead` and 2–4 `homes` labels.
- `StudioScene`: anchor and cameras → ON AIR → control-room camera cut → TVs at home. Set `channel`, `headline`, `anchorName`, `cameraLabels`, and optional fractional `liveAt`, `switchAt`, `homeAt`.
- All four work with empty props and stretch to the scene duration. Preview `rendering/examples/journalism.json` or `JournalismDemo` in Remotion Studio.

Broadcast animation scenes: `SignalHomesScene` for expanding tower waves activating house receivers; `RadioTuningScene` for a dial and visual static settling into a clean waveform; `SatelliteNewsScene` for uplink/downlink and an illustrative delay timer. All use isometric artwork and accept empty props.

Social/digital animations: `FeedScene` modes `scroll` (likes, shares, comment) and `ranking` (scores, reorder); `SpreadScene` modes `viral` and `race` (false post vs delayed correction); `CreatorWorkflowScene` (shoot, edit timeline, upload, views). `MediaTheoryScene` modes `communication`, `agenda`, `two-step`, `gratifications`. Reuse `NewsCycleScene` for gatekeeping. All metrics are illustrative; correction reach does not imply belief changed. Preview `SocialMediaDemo`.

Expanded isometric media props (use the actual object, rather than a generic icon tile):
- Audio: headphones, mixingconsole, boommic, speaker, audiorecorder, podcastbooth.
- Broadcasting: studiocamera (tripod broadcast camera), newsdesk (anchor desk), teleprompter, studiolights, controlmonitors, obvan.
- Film: clapperboard, cinemaprojector, cinemascreen, filmreel, storyboard, editingtimeline, theatrestage.
- Digital: socialpost, scrollingfeed, videoplayer, livestream, comments, repost, notification, hashtag.
- Advertising: productdisplay, campaignboard, sponsoredpost, adplacement, paywall, adpayment (advertiser → payment → publisher).

Public relations and organisations: use `pressrelease` for an official statement, `podium` for a microphone lectern, `pressconference` for panelists addressing reporters, `spokesperson` for the representative, `mediakit` for fact sheets/photos/contacts, and `crisiscentre` for monitoring, verification and coordinated response. These are dedicated isometric objects; connect them with `IsoScene` links and timed steps to show the PR workflow.

Politics and public affairs: `parliament` (legislature), `ballotbox` (voting), `campaignrally` (speaker and crowd), `publicmeeting` (community discussion), `protestplacard` (public expression), `governmentoffice` (public information and services). Use these dedicated isometric objects with links and steps for civic communication examples.
