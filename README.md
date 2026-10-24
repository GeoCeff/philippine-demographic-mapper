# Philippine Demographic Mapper

A local-first web app for creating Philippine choropleth maps with real administrative geometry, place labels and statistics.

Choose a region, province, city/municipality or national scope, load PSGC-coded CSV statistics, or edit an individual place. Export SVG/PNG with text labels and a legend, and save/reload the map as JSON. Source islands, holes and relative geographic positions use one shared map projection; the simplified demonstration shapes are a separate explicit option.

The map stays in view beside one task panel: **Places, Data, Appearance, Export**. Small screens open these tools in one dismissible bottom sheet. Selecting a place opens its editor in the same panel; unfinished place edits survive tab changes. **Open** and **Save** handle editable project files; **Export map** opens the image download controls.

The editor uses a monochrome interface inspired by [Bryl Lim](https://bryllim.com/), with self-hosted Geist fonts, numbered sections and a subtle dot texture. Choose **System**, **Light** or **Dark** in the header. This preference stays in your browser and follows your device in System mode; the map's colors, background, text and exported appearance stay controlled by your project. Reduced-motion preferences disable interface transitions.

The map uses the full canvas and adjusts to its available width and height without stretching the geography. Drag anywhere on the canvas to pan. Scroll over the map to zoom around the pointer, or use **+** / **−** to zoom from the center. **Fit map** restores the full area. Resizing preserves your zoom and position; a fitted map refits automatically. Geography stays inside the map frame while the title, legend and source note stay in place.

Large barangay maps batch same-color polygons into a small number of SVG paths, cull geometry outside a buffered viewport, and use a spatial grid for hover/click selection. All mapped records and statistics remain available. Province/city barangay views load original detailed borders; zoomed national/regional views request nearby city detail when the view fits the bounded download/cache budget. Zooming out restores the lightweight overview. The footer identifies detailed, overview and fallback borders.

Hover over a place for its type, parent areas, labeled identifier, statistic and data source. **PSGC** means **Philippine Standard Geographic Code**: it identifies a place and matches CSV rows, rather than measuring population. Click a place, or press Enter on a focused boundary, to open the same details and edit its statistic or annotation. Missing values explain whether no statistic was added, the CSV cell is blank/invalid, or a manual edit cleared it. A numeric zero remains a real statistic. Unmatched boundary identifiers and approximate name matches are disclosed explicitly.

In **Appearance → Legend**, customize the title, group colors and labels, missing-data entry, text/card colors, opacity and size. **Reverse colors** reverses the active ramp. Blank labels retain the calculated ranges; these display edits do not change statistics or thresholds. Individual editing supports up to 32 groups, while larger custom scales use the selected palette ramp.

Choose **Arrange map** to drag the legend, title, subtitle or source note. Arrow keys move the focused item; Shift moves farther; Escape finishes. **Appearance → Map text and layout** provides text styling, percentage positions, corner/center presets and Reset layout. Positions adapt to the canvas and remain fixed while panning/zooming. Saved projects retain these settings; PNG/SVG downloads omit editing outlines. Opening another project returns to normal map navigation. Mouse dragging suppresses native browser drag/focus boxes while keyboard focus highlights the boundary itself.

## Status

Working local map studio using a **historical, incomplete boundary source**.

The pinned [boundary release](https://github.com/bendlikeabamboo/barangay-boundaries-repository/releases/tag/v2026.4.13.0) uses PSGC October 24, 2023 and NAMRIA November 6, 2023. It supplies 17 region, 82 province, 1,635 city/municipal and 42,026 barangay geometry records. Barangays represent **41,803 distinct PSGC codes**; repeated/fuzzy source matches and missing polygons remain documented in `data/generated/boundary_coverage_report.json`. Overview geometry uses the upstream 0.005° simplification. Detailed barangay geometry comes from a [pinned community mirror of the original November 2023 NAMRIA/OCHA shapefile](https://github.com/altcoder/philippines-psgc-shapefiles/tree/a44a73091f19e4950dbdc0d7cb77a5e17b101a0a/data/2023/BgySubMuns), joined by original source identifiers while retaining the curated PSGC metadata. It preserves original vertices, islands and holes instead of filling or buffering gaps. These historical sources remain incomplete and do not certify current legal boundaries. No missing places are invented.

## Features

- Local static web app with no dependency install required.
- Region, province/independent-city, city/municipality, and barangay layers, including national and regional barangay views.
- Boundary source selector for built-in SVG fixtures or generated normalized GeoJSON.
- Scope picker built from the real source hierarchy, place search, zoom, drag-to-pan, and child-map navigation.
- CSV import using PSGC code joins.
- Match summary and match review panel with duplicate-code warnings, wrong-level checks, parent-scope validation, value checks, and issue CSV export.
- Choropleth palettes, classification modes, border styling, missing-data styling, and highlight color.
- Custom thresholds ignore blank/invalid entries and repeated numbers, preserve explicit zero and negative values, and support more classes than the base palette. An empty list uses equal intervals; nonempty custom lists show open-ended outer classes in the legend.
- PNG and SVG export with square, portrait, and report-size presets plus optional title, subtitle, and source note.
- Project JSON save and load.
- Place-name, statistic and custom-text labels placed inside land polygons, with overlap avoidance and export-safe text halos.
- Editable per-place statistics/annotations, CSV label-column selection, and downloadable PSGC templates for each scope.
- PSGC/boundary reconciliation pipeline scaffold.
- Open boundary fetcher with SHA-256 verification and scoped barangay outputs.

## Quick Start

Requirements:

- Node.js 18 or newer.

Run the local app:

```powershell
npm run boundaries:barangays
npm run serve
```

The boundary build is needed once, or when intentionally changing the source release. It downloads and verifies public source files and generates about 179 MB of active map data; already matching raw downloads are reused. For a pinned build, use `node tools/fetch-boundaries.mjs --include-barangays --release v2026.4.13.0`.

Open:

```text
http://127.0.0.1:4173/
```

GitHub Pages demo:

```text
https://geoceff.github.io/philippine-demographic-mapper/
```

Use the local server for real boundaries; browsers generally block local GeoJSON fetches from `file://` pages. No dependency installation is required.

## Put statistics and labels on places

1. In **Places**, choose an **Area** and **Map level**. Search/filter to narrow the area list, or use **Wider area** to move back. The province layer includes independent cities so their areas, including Metro Manila, are visible. Source province nesting is geographic, not administrative subordination of independent cities.
2. In **Data**, select **Download CSV template**. Fill its `value` and optional `label` columns, keeping PSGC codes as text so leading zeros survive spreadsheet editing.
3. **Import CSV** and choose the statistic/label columns. **Try sample data** creates clearly marked example numbers, not population observations. **Review import** explains rows needing attention and offers an issue download.
4. In **Appearance**, choose **Label display**: names, statistics, both, or custom labels. Zoom or reduce the scope for dense areas; up to 200 non-overlapping labels are displayed at once. Selecting a place prioritizes its label. Less frequent styling controls are under **More options**.
5. Click a place or search by code/name and press Enter. **Apply changes** sets an annotation/statistic without changing your CSV. Blank statistics clear the displayed value; zero is valid. **Use CSV value again** restores imported data; places without a CSV offer **Clear place edit**. The contextual child-map action opens the selected place's children. **Back to controls** returns to the previous task.
6. Use **Export map**, select PNG/SVG and size, then download. The current map, labels, title, source note and optional legend are included. **Save** preserves imported rows, applied manual edits and label settings in an editable JSON project; **Open** restores one. Unapplied fields are retained while switching tasks but must be applied before saving.

For example, this province-level CSV mixes a province and an independent city. The numbers below are illustrative:

```csv
psgc_code,name,value,label
0702200000,Cebu,1250,Study area
1381300000,Quezon City,3200,Priority area
```

Before a new CSV or sample replaces current rows and place edits, choose **Cancel**, **Save and replace**, or **Replace data**. Place-name searches with ambiguous names require choosing a PSGC code. Source-only identifiers such as `NAMRIA_PH0909701` are explicitly marked and are not official PSGC codes. The visible boundary notice opens source/coverage details and a retry action when needed.

The national barangay layer contains tens of thousands of polygons and can take several seconds to load. City/province scopes are easier for labeling. Data and edits stay in the local app; no account or external upload service is required.

## Data Pipeline

Build sample normalized boundary outputs:

```powershell
npm run data:build
```

Validate the small generated test fixture:

```powershell
npm run data:validate
```

Fetch real open PSGC-coded boundaries:

```powershell
npm run boundaries:build
```

Fetch scoped barangay files too:

```powershell
npm run boundaries:barangays
```

Real generated files are written under `data/generated` and are not committed. Missing real data produces a loading/error message rather than silently substituting demonstration shapes. The sample `data:build` command is isolated under `tools/fixtures` so it cannot overwrite real boundaries.

Production-oriented input files can be placed in `data/raw`. The no-dependency pipeline expects:

- PSGC records as CSV or JSON.
- Boundary geometry as GeoJSON FeatureCollection.

Example production-style run:

```powershell
node tools/data-pipeline.mjs --psgc data/raw/psgc_q2_2024.csv --boundaries data/raw/phl_admin_boundaries.geojson --out data/generated --report data/psgc_reconciliation_report.md --metadata data/source_metadata.json
```

The pipeline normalizes common PSA and HDX/OCHA-style fields into:

- `psgc_code`
- `name`
- `level`
- `region_code`
- `province_code`
- `city_municipality_code`
- `barangay_code`
- `source_version`

Generated outputs:

- `data/generated/admin_boundaries.normalized.geojson`
- `data/generated/admin_lookup.json`
- `data/generated/barangays/<scope>/<code>.geojson`
- `data/psgc_reconciliation_report.md`

## Data Sources

Primary production sources identified in the project plan:

- PSA PSGC: official geographic codes and administrative hierarchy.
- PSA PSGC API: official versioned endpoint for regions, provinces, cities/municipalities, and barangays.
- `bendlikeabamboo/barangay-boundaries-repository`: MIT-licensed PSGC-coded GeoJSON derived from PSA PSGC snapshots and NAMRIA shapefiles.
- HDX/OCHA Philippines Subnational Administrative Boundaries: practical public admin 0-4 geometry sourced from NAMRIA/PSA, with important caveats.

Boundary metadata should be reviewed before claiming reliable barangay matching.

## Project Structure

```text
.
|-- index.html
|-- styles.css
|-- src/
|   |-- app.js
|   |-- boundary-loader.js
|   |-- classification.js
|   |-- csv.js
|   |-- data.js
|   |-- export.js
|   |-- matching.js
|   |-- render-utils.js
|   |-- state.js
|   `-- utils.js
|-- tools/
|   |-- data-pipeline.mjs
|   |-- fetch-boundaries.mjs
|   |-- fixtures/
|   `-- README.md
|-- data/
|   |-- raw/
|   |-- generated/
|   |-- psgc_reconciliation_report.md
|   `-- source_metadata.json
|-- sample-data/
|-- MAP_MAKER_PLAN.md
`-- server.mjs
```

## Scripts

```powershell
npm run serve
npm run boundaries:build
npm run boundaries:barangays
npm run boundaries:check
npm run data:build
npm run data:validate
npm run check
npm test
```

## Roadmap

- Expand generated boundary rendering toward PMTiles/vector tiles.
- Add production PSGC download/import workflow.
- Convert shapefile or GeoPackage sources into GeoJSON/PMTiles.
- Move interactive rendering to MapLibre + vector tiles for full barangay performance.
- Add fuzzy name matching after PSGC-code joins and parent-scope validation are reliable.
- Add richer export templates, labels, callouts, and inset support.
- Extend automated browser and export-image tests beyond the current fixture and integration checks.

## Contributing

Contributions are welcome. Start with `CONTRIBUTING.md`, and keep source-data caveats visible in any data or rendering changes.

## License

App code: MIT. See `LICENSE`. Boundary data retains PSA/NAMRIA attribution and source terms; the upstream repository's MIT code license is not a blanket MIT license for its data. See `tools/README.md`, the source metadata and the generated coverage report.
