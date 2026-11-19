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
  - FactCheckScene
  - CaseStudyScene
  - ProfileScene
  - LayersScene
  - ImageScene
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

Teach media as people and things doing something: a sender makes a message, a channel carries it, an audience receives and reacts. Make every idea visible.

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

Use real examples with source-supported statistics, dates and quotes. Keep claims general when evidence is unavailable. Introduce illustrative reach, ratings, opinion and trust values as “example numbers” in narration and identify the example on screen. Describe exposure with “Saw it” and distribution with “Shared.” Attribute changes in understanding, belief or opinion only when the topic provides evidence. Keep both series visible together for rumour versus correction and reach versus understanding.

For individual beats in IsoScene, use `flow: "wave"` for a broadcast, `via` for an opinion leader, `noise: true` for interference, and a dashed link from the audience to the sender for feedback. Use timed `spread`, `gate`, `frame`, `agenda`, `bubble`, `race`, `attention`, `opinion`, `split`, `react`, `say` and `headline` fields to demonstrate the corresponding changes on the diagram.

Journalism and media scenes:
- NewsCycleScene follows a story from reporting through gatekeeping to publication and reaction. FrontPageScene shows how editors give a story more prominence. PrintDeliveryScene and StudioScene cover delivery and live broadcast.
- SignalHomesScene shows broadcast coverage. RadioTuningScene illustrates tuning and static. SatelliteNewsScene demonstrates uplink, downlink and illustrative delay.
- FeedScene shows scrolling or ranking. SpreadScene compares the reach of a rumour and correction. CreatorWorkflowScene shows video production. MediaTheoryScene covers communication, agenda setting, two-step flow and uses and gratifications.
- FactCheckScene holds a claim, shows sourced evidence, and explains a verdict. Use ImageScene hotspots for ad or front-page anatomy. Use CaseStudyScene for a campaign with a measured result, ProfileScene for an audience segment, and LayersScene for AIDA.

Expanded isometric media props (use the actual object, rather than a generic icon tile):
- Broadcasting: studiocamera (tripod broadcast camera), newsdesk (anchor desk), teleprompter, studiolights, controlmonitors, obvan.
- Film: clapperboard, cinemaprojector, cinemascreen, filmreel, storyboard, editingtimeline, theatrestage.
- Digital: socialpost, scrollingfeed, videoplayer, livestream, comments, repost, notification, hashtag.
- Advertising: productdisplay, campaignboard, sponsoredpost, adplacement, paywall, adpayment (advertiser → payment → publisher).

Public relations and organisations: use `pressrelease` for an official statement, `podium` for a microphone lectern, `pressconference` for panelists addressing reporters, `spokesperson` for the representative, `mediakit` for fact sheets/photos/contacts, and `crisiscentre` for monitoring, verification and coordinated response. These are dedicated isometric objects; connect them with `IsoScene` links and timed steps to show the PR workflow.

Politics and public affairs: `parliament` (legislature), `ballotbox` (voting), `campaignrally` (speaker and crowd), `publicmeeting` (community discussion), `protestplacard` (public expression), `governmentoffice` (public information and services). Use these dedicated isometric objects with links and steps for civic communication examples.
