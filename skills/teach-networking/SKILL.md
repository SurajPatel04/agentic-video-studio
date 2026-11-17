---
name: teach-networking
description: Explain networks through packet journeys, topology, and concrete device
  roles.
metadata:
  roles:
  - planner
  tags:
  - networking
  - network
  - networks
  - tcp
  - udp
  - dns
  - router
  - routing
  - lan
  - wan
  - internet
  - packet
  - http
  - ip address
  - nat
  - firewall
  scenes:
  - PacketScene
  - IsoScene
  - NetworkScene
  - PacketJourneyScene
  - FlowchartScene
  overlays: []
  long_video: false
---

Start with a concrete communication goal: which device needs to send what to which other device? Give endpoints stable labels and trace one message or packet through the system.

Choose a topology view to establish physical or logical relationships, then a packet journey to show sequence. Distinguish packets, frames, addresses, and application messages when relevant; do not use these terms interchangeably. Tie each protocol or device to the problem it solves.

Reuse endpoint names, address examples, colors, and positions across scenes. Introduce only the new layer or hop being explained. Keep unrelated infrastructure out of simple examples. Clearly label simplified models and separate a successful exchange from a failure or retry.

Use comparisons for genuine tradeoffs and a prediction question at a useful checkpoint. Avoid turning the chapter into a list of acronym definitions. Read the actual scene contracts; use an available general diagram if the library cannot accurately depict the specialized operation.

PacketScene (paper style; allowed even when a style guide says "every scene IsoScene") is the best way to show WHAT a packet carries and HOW a device decides: "nodes" left to right (strings are fine: "Your laptop", "Router", "DNS server"), "links" (only when there is a branch), "packet": {"label", "fields": {"Dst IP": "93.184.216.34", "Port": "443", "TTL": "64"}}, "steps": send / route (to a node), open, read (field, text), change (field, value: TTL 64 -> 63, NAT rewrites Src IP), note (text), close, drop (text). One idea per scene: the router reads Dst IP and picks a path; DNS reads the name and answers an IP; a firewall reads the port and drops the packet.
