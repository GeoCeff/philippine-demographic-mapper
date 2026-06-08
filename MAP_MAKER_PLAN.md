# Demographic Map Maker Plan

Current planning date: 2026-05-27

## Goal

Build a program for creating clean, infographic-style Philippine demographic maps like the reference image, with geography support down to the barangay level. Text labels, rankings, and callout typography are out of scope for the first version, but the architecture should leave room for them later.

The core product is a local-first map design app where the user can:

- Pick a Philippine geography level: country, region, province, city/municipality, or barangay.
- Load a demographic dataset keyed by PSGC code or matched location name.
- Style the selected geography as a choropleth or highlighted map.
- Export a polished static image for reports, social posts, or infographics.

## Important Barangay-Level Reality

Barangay support is feasible, but it should not mean showing every barangay in the Philippines at once with full detail. Current PSA PSGC summary data lists 42,010 barangays, while the public HDX/OCHA administrative boundary dataset reports 42,048 admin-level-4 features. That mismatch needs a reconciliation step before the app can claim reliable barangay matching.

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

## Recommended Product Shape

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

Create a repeatable `data` build pipeline:

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
   - CSV or XLSX
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

- Automatic text label placement.
- Callout leader lines.
- Ranking badges.
- Built-in demographic datasets beyond sample data.
- Manual polygon editing.
- Legal-boundary certification.

## Key Features After MVP

- Fuzzy name matching with a review table.
- XLSX import.
- Preset layouts inspired by editorial/social graphics.
- Insets for small or island-heavy geographies.
- Label and callout editor.
- Export templates:
  - square
  - 4:5 social post
  - portrait report page
  - widescreen slide
- Batch export for multiple provinces or cities.
- Data classification modes:
  - equal interval
  - quantile
  - natural breaks
  - custom thresholds
- Accessibility checks for color contrast and colorblind-safe palettes.

## Technical Architecture

Frontend modules:

- `MapCanvas`: renders MapLibre map, handles viewport and layers.
- `LayerPanel`: toggles admin levels and visual layers.
- `DataImportPanel`: handles CSV/XLSX import and join selection.
- `MatchReviewPanel`: shows matched/unmatched geography rows.
- `StylePanel`: controls color ramp, borders, opacity, missing data, and highlights.
- `ExportPanel`: controls dimensions, scale, background, and file type.
- `ProjectStore`: stores map scope, data joins, styles, and export settings.

Backend or CLI modules:

- `fetch_sources`: downloads or verifies source files.
- `build_psgc_index`: pulls PSA PSGC records and versions.
- `normalize_boundaries`: converts source geometry into internal schema.
- `reconcile_psgc`: compares boundary features against PSA codes.
- `build_tiles`: creates vector tile or PMTiles outputs.
- `build_fixtures`: creates small sample datasets for tests and demos.

## Rendering Strategy

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

- Full barangay GeoJSON is too large for direct browser rendering.
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

- Compare PSA PSGC barangay count with boundary feature count.
- Confirm every imported sample PSGC code maps to exactly one feature.
- Produce a report for unmatched or ambiguous geographies.

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

### Milestone 1: Data Foundation

- Set up project skeleton.
- Add data-source metadata file.
- Build PSGC lookup import.
- Convert boundary source into normalized local data.
- Produce first reconciliation report.

### Milestone 2: Tile Generation

- Generate vector tiles/PMTiles for admin levels.
- Confirm tiles render in a minimal MapLibre page.
- Add parent-geography filters.

### Milestone 3: Basic Map Editor

- Add map canvas.
- Add geography scope picker.
- Add layer styling controls.
- Add simple color ramp.

### Milestone 4: Data Join

- Add CSV import.
- Join by PSGC code.
- Display matched and unmatched records.
- Apply values to choropleth fills.

### Milestone 5: Export

- Add fixed-size export frame.
- Export PNG.
- Save and reload project JSON.

### Milestone 6: Infographic Polish

- Add layout presets.
- Add inset support.
- Add optional labels and callouts.
- Add ranking/card overlays later, after map rendering is reliable.

## Open Decisions

- Package target: local web app only, desktop app, or both.
- Preferred export sizes.
- Whether the app should ship with prebuilt boundary tiles or build them locally.
- Whether to support only PSGC-coded imports in MVP or include fuzzy matching immediately.
- Whether SVG/PDF export is required early or PNG is enough first.

## Definition of Done for MVP

The MVP is done when a user can open the app, choose a province or city, load a PSGC-coded CSV with barangay-level values, style the map, and export a clean PNG without manually touching GIS software.
