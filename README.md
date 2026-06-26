# Philippine Demographic Mapper

A local-first web app for creating clean, infographic-style Philippine demographic maps.

The current prototype supports a complete first workflow: choose a geography scope, load PSGC-coded CSV data, style a choropleth, review matches, export PNG/SVG, and save or reload a project JSON. It also includes a no-dependency boundary fetch/normalization path for open PSGC-coded Philippine boundary data.

## Status

Prototype / data foundation.

Important caveat: the built-in map fixtures are simplified samples and should not be used for legal, planning, or statistical publication work. For real geometry, run the boundary fetch scripts and keep the source metadata visible in exported work.

## Features

- Local static web app with no dependency install required.
- Region, province, city/municipality, and scoped barangay map levels.
- Boundary source selector for built-in SVG fixtures or generated normalized GeoJSON.
- Scope picker for national, regional, provincial, and city-focused views.
- CSV import using PSGC code joins.
- Match summary and match review panel with duplicate-code warnings, wrong-level checks, parent-scope validation, value checks, and issue CSV export.
- Choropleth palettes, classification modes, border styling, missing-data styling, and highlight color.
- PNG and SVG export with square, portrait, and report-size presets plus optional title, subtitle, and source note.
- Project JSON save and load.
- PSGC/boundary reconciliation pipeline scaffold.
- Open boundary fetcher with SHA-256 verification and scoped barangay outputs.

## Quick Start

Requirements:

- Node.js 18 or newer.

Run the local app:

```powershell
npm run serve
```

Open:

```text
http://127.0.0.1:4173/
```

GitHub Pages demo:

```text
https://geoceff.github.io/philippine-demographic-mapper/
```

You can also open `index.html` directly in a browser for the static prototype.

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

Generated files are written under `data/generated` and are not committed. The app falls back to built-in sample fixtures when generated files are absent.

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
- Add automated browser and export-image tests.

## Contributing

Contributions are welcome. Start with `CONTRIBUTING.md`, and keep source-data caveats visible in any data or rendering changes.

## License

MIT. See `LICENSE`.
