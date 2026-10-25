# Demographic Map Maker Plan

Baseline planning date: 2026-05-27. Implementation update: 2026-10-25.

The current app keeps its dependency-free static implementation. Real historical boundaries at every level, nationwide/scoped barangay loading, per-place labels/statistics, manual edits, and SVG/PNG legends are implemented. The editor includes movable map text/legends, color controls, light/dark UI, pan/pinch/zoom, Focus map and an export page preview. JSON projects retain camera and metric metadata; IndexedDB recovery, New and bounded undo/redo support local editing.

Pinned overview and original ADM4 detail builds use native Node tools with checksums and explicit incomplete coverage. Full-package validation is read-only, and output publication stages files with rollback on failure. The original stack/tile proposals below remain future scaling options, not required dependencies. See [README.md](README.md) for current usage and [tools/README.md](tools/README.md) for the implemented pipeline.

## Goal

Build a program for creating clean, infographic-style Philippine demographic maps like the reference image, with geography support down to the barangay level and place-name, statistic and custom labels. Rankings and callout typography remain future work.

The core product is a local-first map design app where the user can:

- Pick a Philippine geography level: country, region, province, city/municipality, or barangay.
- Load a demographic dataset keyed by PSGC code; reviewed name-assisted matching for imported statistics remains future work.
- Style the selected geography as a choropleth or highlighted map.
- Export a polished static image for reports, social posts, or infographics.

## Important Barangay-Level Reality

The implemented source package has 42,026 barangay geometry records representing 41,803 distinct PSGC codes, based on 2023 PSA/NAMRIA data. It has documented missing/fuzzy/repeated matches. A lightweight simplified overview now uses color batches, buffered viewport culling and spatial hit testing; original unsimplified barangay geometry loads for focused scopes and bounded zoomed views. Gzip city detail, indexed search and cached hierarchy lookups avoid loading or rebuilding the entire detailed country on each interaction. Do not equate polygon count with complete current administrative coverage.

Practical design rule:

- National map view: best for regions, provinces, or cities/municipalities.
- Province/city/municipality focused view: best for barangay-level maps.
- Full-country barangay view: allowed for data completeness and export, but visually dense and probably not useful without aggregation or zoomed insets.

## Visual Target

The reference image has these reusable design traits:

- No conventional basemap.
- A simplified Philippines silhouette.
- Filled administrative polygons using a restrained color ramp.
- Thin internal borders, usually white or pale.
- Strong contrast for highlighted areas.
- Poster-style export dimensions.
- Optional background texture or low-opacity decorative shape later.

First version should focus on the map body only:

- Choropleth fills.
- Boundary strokes.
- Region/province/city/barangay selection.
- Transparent or solid background.
- Export-ready layout.

## Future Product/Stack Options

Build a web app that runs locally during development and can later be packaged as a desktop app if needed.

Suggested stack:

- Frontend: React, TypeScript, Vite.
- Map rendering: MapLibre GL JS for WebGL vector maps.
- Styling/math: D3 color scales.
- State: Zustand or a small reducer-based store.
- Data prep: Python or Node CLI using GDAL/OGR, Mapshaper, and Tippecanoe.
- Geometry delivery: PMTiles or local vector tile files instead of loading all barangay polygons as one giant GeoJSON.
- Project persistence: JSON project files plus local assets.

Why this shape:

- The app needs design controls, not just GIS viewing.
- Barangay boundaries are too heavy for naive browser GeoJSON at national scale.
- Static export quality matters as much as interactivity.

## Data Sources

Primary reference data:

- [PSA PSGC](https://psa.gov.ph/classification/psgc/summary): official geographic codes and administrative hierarchy.
- [PSA PSGC API](https://psa.gov.ph/classifications-api/psgc): official API for regions, provinces, cities/municipalities, barangays, versions, and PSGC filtering.
- [HDX/OCHA Philippines Subnational Administrative Boundaries](https://data.humdata.org/dataset/caf116df-f984-4deb-85ca-41b349d3f313): public admin 0-4 boundary dataset sourced from NAMRIA/PSA, useful for region through barangay geometry.
- [BTAA mirror metadata for the HDX dataset](https://geo.btaa.org/catalog/caf116df-f984-4deb-85ca-41b349d3f313): useful because it exposes caveats, level counts, review dates, and license metadata.
- [GeoRisk ArcGIS PSA Barangay layer](https://portal.georisk.gov.ph/arcgis/rest/services/PSA/Barangay/MapServer/layers): older 2016 PSA barangay boundary service with GeoJSON support; useful as a fallback or comparison source, not the preferred primary dataset.

Data caveat:

The app should clearly record dataset version, source, and caveats. HDX/OCHA boundaries are public and practical, but the metadata describes them as indicative rather than official legal boundaries.

## Data Pipeline

The implemented complete build is `npm run boundaries:full`; `npm run boundaries:check` verifies existing sources, outputs and exact detail geometry. The general custom-source importer writes isolated normalized GeoJSON, lookup, report and metadata; see [data/raw/README.md](data/raw/README.md). It does not rebuild the active country's full package.

The original future scaling pipeline is:

1. Download source boundary files.
2. Normalize all admin levels to a common CRS.
3. Convert shapefiles to GeoPackage or GeoParquet for stable processing.
4. Normalize field names:
   - `psgc_code`
   - `name`
   - `level`
   - `region_code`
   - `province_code`
   - `city_municipality_code`
   - `barangay_code`
   - `source_version`
5. Join HDX/OCHA boundary records to PSA PSGC records.
6. Generate a reconciliation report:
   - matched records
   - unmatched PSGC barangays
   - boundary records missing from current PSGC
   - renamed or duplicate names
   - geometry issues
7. Simplify geometries by zoom/export level.
8. Generate vector tiles or PMTiles for the app.
9. Generate a lightweight lookup database for search and joins.

Outputs:

- `admin_boundaries.pmtiles`
- `admin_lookup.sqlite` or `admin_lookup.duckdb`
- `psgc_reconciliation_report.md`
- `source_metadata.json`

## App Workflow

1. Start a project.
2. Choose map scope:
   - Philippines
   - region
   - province
   - city/municipality
   - custom selection
3. Choose map level:
   - region
   - province
   - city/municipality
   - barangay
4. Import data:
   - CSV is implemented; XLSX remains future work
   - required value column
   - preferred join key: PSGC code
   - fallback join: normalized name plus parent geography
5. Review matches:
   - exact matches
   - fuzzy matches
   - unmatched rows
   - duplicate names needing parent context
6. Style map:
   - palette
   - bins or continuous scale
   - highlight color
   - border color and thickness
   - background color or transparency
   - missing-data style
7. Export:
   - PNG
   - SVG or PDF if practical
   - project JSON

## MVP Scope

The first useful version should include:

- A Philippines map canvas with no basemap.
- Region, province, city/municipality, and barangay boundary layers.
- Scope picker for at least one region/province/city to prove barangay-level rendering.
- CSV import with PSGC-code join.
- Choropleth style controls.
- Missing-data styling.
- Static PNG export.
- Saved project configuration.

MVP non-goals:

- Callout leader lines.
- Ranking badges.
- Built-in demographic datasets beyond sample data.
- Manual polygon editing.
- Legal-boundary certification.

## Remaining Features After MVP

The editor already provides labels, match review, movable legend/text presets, square/portrait/report-size exports, and equal-interval, quantile, continuous, highlight and custom-threshold color modes.

- Reviewed fuzzy matching for imported user data beyond normalized name plus parent context.
- XLSX import.
- Insets for small or island-heavy geographies.
- Callout leader lines and richer editorial/export templates.
- Batch export for multiple provinces or cities.
- Natural-breaks classification.
- Broader automated accessibility and export-image checks; a colorblind-safe palette is already available.

## Future Architecture Options

Current rendering uses classic-script modules under `src`, an SVG projection, batched paths, viewport culling, spatial hit testing and bounded original-detail loading. Local recovery is in `src/project-session.js`; data extraction/validation lives under `tools`. The following component names describe a possible migration, not existing files.

Proposed frontend modules:

- `MapCanvas`: renders MapLibre map, handles viewport and layers.
- `LayerPanel`: toggles admin levels and visual layers.
- `DataImportPanel`: handles CSV/XLSX import and join selection.
- `MatchReviewPanel`: shows matched/unmatched geography rows.
- `StylePanel`: controls color ramp, borders, opacity, missing data, and highlights.
- `ExportPanel`: controls dimensions, scale, background, and file type.
- `ProjectStore`: stores map scope, data joins, styles, and export settings.

Proposed backend or CLI modules:

- `fetch_sources`: downloads or verifies source files.
- `build_psgc_index`: pulls PSA PSGC records and versions.
- `normalize_boundaries`: converts source geometry into internal schema.
- `reconcile_psgc`: compares boundary features against PSA codes.
- `build_tiles`: creates vector tile or PMTiles outputs.
- `build_fixtures`: creates small sample datasets for tests and demos.

## Future Tile Rendering Strategy

Current PNG/SVG export uses the SVG map and preserved geometry. Vector tiles and PDF export below are proposals.

Use vector tiles for normal interaction:

- Render admin polygons by level.
- Filter tiles by selected scope.
- Style fills dynamically from imported data.
- Keep boundaries crisp with separate line layers.

Use a dedicated export path:

- Set fixed viewport and dimensions.
- Render at high pixel ratio.
- Wait for all map tiles to load.
- Export canvas to PNG.
- Later, add SVG/PDF export through a separate geometry-to-SVG renderer if MapLibre canvas export is not enough.

## Performance Risks

- Loading all original barangay detail at once is too large for normal browser interaction; keep the overview and bounded detail tiers.
- Island geometry can create very large polygon feature counts.
- Fuzzy matching can produce false positives if barangay names repeat across cities.
- Exporting high-resolution images can fail if the browser canvas exceeds GPU limits.

Mitigations:

- Use PMTiles/vector tiles.
- Filter barangay rendering by selected parent geography where possible.
- Require parent context for non-code joins.
- Keep simplified geometry tiers.
- Add export size presets with tested maximums.

## Validation Plan

Data validation:

- Report source polygon count, distinct PSGC count and documented missing places separately.
- Preserve every source polygon, including repeated PSGC assignments; apply a joined statistic consistently to all records sharing its code.
- Produce a report for unmatched or ambiguous geographies.
- Verify raw/generated hashes, exact original detail coordinates, islands/holes and indexed scope membership.

Rendering validation:

- Test national region-level map.
- Test province-level city/municipality map.
- Test city-level barangay map.
- Test an island-heavy province.
- Test NCR barangay density.

Export validation:

- Export transparent PNG.
- Export solid-background PNG.
- Export at social-post size.
- Export at print-ish high resolution.

## Suggested Milestones

### Milestone 1: Data Foundation — Implemented for the Pinned Historical Source

- Set up project skeleton.
- Add data-source metadata file.
- Build PSGC lookup import.
- Convert boundary source into normalized local data.
- Produce first reconciliation report.

### Milestone 2: Tile Generation — Future Option

- Generate vector tiles/PMTiles for admin levels.
- Confirm tiles render in a minimal MapLibre page.
- Add parent-geography filters.

### Milestone 3: Basic Map Editor — Implemented

- Add map canvas.
- Add geography scope picker.
- Add layer styling controls.
- Add simple color ramp.

### Milestone 4: Data Join — Implemented

- Add CSV import.
- Join by PSGC code.
- Display matched and unmatched records.
- Apply values to choropleth fills.

### Milestone 5: Export — Implemented for PNG/SVG and Project JSON

- Add fixed-size export frame.
- Export PNG.
- Save and reload project JSON.

### Milestone 6: Infographic Polish — Partly Implemented

- Movable legend/map text, labels and layout presets are implemented.
- Add inset support.
- Add callouts.
- Add ranking/card overlays later, after map rendering is reliable.

## Open Decisions

- Whether a desktop package is useful beyond the current static web app.
- Which additional export templates, insets and batch workflows are useful.
- Whether vector tiles justify a new rendering stack beyond the current bounded detail approach.
- How to review future fuzzy matching without silently joining ambiguous places.
- Whether PDF export is needed alongside the existing PNG/SVG outputs.

## Definition of Done for MVP

The MVP is done when a user can open the app, choose a province or city, load a PSGC-coded CSV with barangay-level values, style the map, and export a clean PNG without manually touching GIS software.
