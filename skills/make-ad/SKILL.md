---
name: make-ad
description: Create advertisements and promos with audience-relevant benefits, credible
  support, and a clear next action.
metadata:
  roles:
  - planner
  category: format
  # only for "ad": true (CLI --ad) or when named in "skills"; never picked from the prompt's words
  on_request: true
  tags:
  - ad
  - advertisement
  - advert
  - promo
  - promotional
  - commercial
  - campaign
  - promote
  scenes:
  - TitleScene
  - ExampleCardScene
  - ComparisonTableScene
---

Apply only when the user requests an advertisement, promotion, or commercial. A lesson discussing advertising should follow lecture guidance instead. Adapt tone to the product, audience, platform, and user brief.

Lead with a relevant need, aspiration, use case, or product experience. Communicate one primary promise and connect features to specific benefits. Build a short path from attention to understanding to action; a slow textbook introduction or closing quiz usually does not serve an ad.

Show the product or service in use only with supplied assets or visuals the library can honestly represent. Do not invent screenshots, demonstrations, or before-and-after results. Prefer a small number of readable messages with narration that adds context rather than repeats them verbatim.

Use only supported claims, prices, availability, certifications, testimonials, and measurable outcomes provided in the brief. Never fabricate scarcity, endorsements, guarantees, discounts, statistics, or a website. A hypothetical example must not masquerade as customer evidence. If proof is absent, focus on described features and plausible use cases without promising results.

End with one actionable next step using supplied destination or contact details when available. If none is supplied, use a generic appropriate invitation without inventing a URL. Match the requested duration and keep key text readable; persuasion should not hide conditions or important qualifiers. For a longer product presentation, organize sections around audience questions and evidence rather than extending a short slogan with filler.
