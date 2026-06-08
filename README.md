# Philippine Demographic Mapper

A local-first web app for creating clean, infographic-style Philippine demographic maps.

The current prototype supports a complete first workflow: choose a geography scope, load PSGC-coded CSV data, style a choropleth, review matches, export a PNG, and save or reload a project JSON. It also includes the first data-foundation pipeline for normalizing PSGC and boundary source files into app-ready lookup and GeoJSON outputs.

## Status

Prototype / data foundation.

Important caveat: the visible map in the app currently uses simplified sample polygons. These are not official boundaries and should not be used for legal, planning, or statistical publication work. Production boundary support should come from running the data pipeline against current PSA PSGC records and reviewed boundary geometry.

## Features

- Local static web app with no dependency install required.
- Region, province, city/municipality, and sample barangay map levels.
- Scope picker for national, regional, provincial, and city-focused views.
- CSV import using PSGC code joins.
- Match summary and match review panel.
- Choropleth palettes, classification modes, border styling, missing-data styling, and highlight color.
- PNG export with square, portrait, and report-size presets.
- Project JSON save and load.
- PSGC/boundary reconciliation pipeline scaffold.
- Generated normalized boundary GeoJSON, lookup JSON, and reconciliation report.

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

You can also open `index.html` directly in a browser for the static prototype.

## Data Pipeline

Build sample normalized boundary outputs:

```powershell
npm run data:build
```

Validate generated outputs:

```powershell
npm run data:validate
```

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
- `data/psgc_reconciliation_report.md`

## Data Sources

Primary production sources identified in the project plan:

- PSA PSGC: official geographic codes and administrative hierarchy.
- PSA PSGC API: official versioned endpoint for regions, provinces, cities/municipalities, and barangays.
- HDX/OCHA Philippines Subnational Administrative Boundaries: practical public admin 0-4 geometry sourced from NAMRIA/PSA, with important caveats.

The HDX/OCHA boundary metadata describes the geometry as indicative rather than official legal boundaries. The reconciliation report should be reviewed before claiming reliable barangay matching.

## Project Structure

```text
.
├── index.html
├── styles.css
├── src/
│   └── app.js
├── tools/
│   ├── data-pipeline.mjs
│   ├── fixtures/
│   └── README.md
├── data/
│   ├── raw/
│   ├── generated/
│   ├── psgc_reconciliation_report.md
│   └── source_metadata.json
├── sample-data/
├── MAP_MAKER_PLAN.md
└── server.mjs
```

## Scripts

```powershell
npm run serve
npm run data:build
npm run data:validate
npm run check
```

## Roadmap

- Replace display fixtures with normalized generated boundaries.
- Add production PSGC download/import workflow.
- Convert shapefile or GeoPackage sources into GeoJSON/PMTiles.
- Move interactive rendering to MapLibre + vector tiles for full barangay performance.
- Add fuzzy name matching with parent-geography review.
- Add export templates, labels, callouts, and inset support.
- Add automated browser and export-image tests.

## Contributing

Contributions are welcome. Start with `CONTRIBUTING.md`, and keep source-data caveats visible in any data or rendering changes.

## License

MIT. See `LICENSE`.
