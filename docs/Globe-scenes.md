# Realistic globe

The existing `GlobeScene` now defaults to a local NASA Blue Marble surface, directional lighting, an atmospheric rim, a star field, and a higher-resolution world boundary dataset. Existing routes, city locations, camera-follow animation, timing, colors, and labels remain supported.

India uses the **official Indian boundary depiction** by default, sourced from Survey of India's downloadable vector outline. It includes territories claimed by India and the island groups. Other world boundaries come from Natural Earth; those lines are masked inside the official India outline. The satellite texture itself contains no political boundaries.

## Preview

```sh
cd rendering
npm run studio
# Select GlobeDemo for the existing India-to-world route animation.
npx remotion render GlobeDemo out/globe-realistic.mp4
npx remotion still GlobeDemo out/globe-india.png --props=examples/globe-india.json --frame=60
```

## Additional props

| Prop | Default | Options |
| --- | --- | --- |
| `surface` | `satellite` | `political` restores flat map colors |
| `indiaBoundary` | `official` | `natural-earth` uses the base dataset's boundary convention |
| `showAtmosphere` | true | Toggle the blue atmospheric rim |
| `showStars` | true | false uses the composition's background |

`highlightCountries: ["India"]` highlights the official outline without hiding the terrain. With no routes or cities the globe initially faces India. Existing `highlightRouteCountries` works as before. `oceanColor` and `landColor` apply to the political surface; satellite colors come from the imagery.

Assets load locally and block the initial render until ready. All motion is driven by the current Remotion frame. Source credits and conversion details are in `rendering/public/earth/SOURCES.md` and `rendering/src/data/SOURCES.md`. The derived map is for visualization, not a certified survey map.

Validation: `npm run typecheck` and `node scripts/check-globe-geography.mjs`.
