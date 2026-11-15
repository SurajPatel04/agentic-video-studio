# India boundary

`india-soi.json`: derived from Survey of India's official **Outline_of_India.zip**, published on its Outline Maps of India page, downloaded 2026-11-15.

- Page: https://surveyofindia.gov.in/pages/outline-maps-of-india
- Archive: https://surveyofindia.gov.in/documents/Outline_of_India.zip
- Archive shapefile dated 2026-02-13; source generalized at 1:16 million scale.
- Source CRS: WGS84 Lambert Conformal Conic, central meridian 80°, latitude of origin 24°, standard parallels 12.472944° and 35.172806°, false easting/northing 4,000,000 m.
- Converted to WGS84 longitude/latitude; simplified at 750 m in source CRS, rounded to five decimals. Includes 1,151 polygon parts, including island groups.
- Conversion script: `rendering/scripts/convert-india-outline.py` (Python standard library).

This is the official Indian boundary depiction, including territories claimed by India. It is a cartographic convention selected for this project, not a statement that all boundaries are internationally agreed. This derived visualization is not a Survey of India certified map.

Other countries: Natural Earth via world-atlas 2.0.2, 1:50 million. The official India polygon masks underlying Natural Earth lines within its extent to avoid conflicting outlines.
