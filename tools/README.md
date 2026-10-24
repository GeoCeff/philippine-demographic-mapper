# Data Pipeline Tools

`data-pipeline.mjs` is the first data-foundation implementation for the map maker.

It does four jobs:

1. Reads PSGC CSV/JSON and boundary GeoJSON.
2. Normalizes source fields into the app schema.
3. Reconciles boundary features to PSGC by code, with a normalized name plus parent fallback.
4. Writes generated boundaries, lookup data, and a reconciliation report.

## Scripts

```powershell
npm run data:build
npm run data:validate
npm run boundaries:build
npm run boundaries:barangays
npm run boundaries:detail
npm run boundaries:check
```

`npm run data:build` is a fixture demonstration, not a countrywide boundary build. Check its configured output before running it over real generated data. The fixture validator (`npm run data:validate`) only reads the checked-in fixture outputs.

`npm run boundaries:build` obtains the latest release manifest from `bendlikeabamboo/barangay-boundaries-repository`, verifies byte counts, SHA-256 and feature counts against its source files, and writes normalized app data. Matching cached raw files are reused. Different existing raw files cause an error instead of being replaced; select a separate `--raw` directory for a different release. Linked data paths are refused.

`npm run boundaries:barangays` includes all available source barangay polygons, both a national file and region/province/city extracts. A later admin build retains and refreshes an existing same-release barangay build. All source polygon coordinates, multipolygons and holes are retained exactly; no extra simplification, synthetic geometry or polygon dissolve occurs.

Run `npm run boundaries:detail` **after** the base barangay build. It verifies five pinned original 2023 SHP/SHX/DBF/CRS components (316 MB), reads Polygon records with the native binary reader, and joins them to the existing curated records by NAMRIA pcode. It stages deterministic gzip city chunks before publishing their descriptors into the existing index; original metadata, duplicate PSGC assignments and record counts stay unchanged. Different cached inputs/published detail chunks are refused. Province descriptors reference city chunks rather than duplicating full geometry. The full build produced 42,026 polygons in 1,633 compressed city chunks, about 191 MB rather than 697 MB uncompressed. Rebuilding the base index requires running the detail step again.

The browser verifies compressed byte counts/SHA-256 and uses native gzip decompression. Province/city scopes use detail directly; zoomed overview maps load nearby detail with at most 24 cached cities, 5,000 source records and 8 MB of compressed requested data per viewport. A failed/unsupported detail load retains the overview and identifies that fallback. The native reader validates binary structure, WGS84 vertices, ring closure and hole ownership; it does not alter coordinates to conceal source gaps.

For a reproducible complete source extract:

```powershell
node tools/fetch-boundaries.mjs --include-barangays --release v2026.4.13.0
node tools/check-boundaries.mjs
node --test tools/boundary-pipeline.test.mjs
```

`npm run boundaries:check` rebuilds and then runs that checker. The checker verifies raw and generated checksums, exact source geometry, source record conservation, counts, and every indexed scope's membership. The unit tests cover canonical city mapping, unmatched/source IDs, duplicate records, polygon holes, malformed source inputs, and preserving different existing raw files.

## Output contract

- `data/generated/admin_boundaries.normalized.geojson`: region, province and city/municipality source polygon records, including the unmatched City of Isabela HUC record with a transparent `NAMRIA_PH0909701` identifier.
- `data/generated/admin_lookup.json`: corresponding properties plus geographic bounds.
- `data/generated/barangays/national.geojson`: all available barangay source polygons.
- `data/generated/barangays/index.json`: `national` descriptor and `scopes.region`, `scopes.province`, `scopes.city` arrays. Each descriptor has `code`, path relative to `data/generated`, polygon `features`, `unique_psgc_codes`, unmatched/fuzzy counts, byte count and SHA-256. Load only files listed by this index; old unreferenced extracts are left untouched.
- `data/generated/boundary_coverage_report.json`: source missing-place lists, source limitations, repeated PSGC assignments, unmatched records and distinct-code counts. `complete: false` is intentional for the current source.
- `data/source_metadata.json`: release/snapshot versions, raw and generated digests, attribution, licensing distinction, artifact paths and counts. Original downloaded manifest, classification report, summary, and code license are retained beside the raw GeoJSON files.

Normalized properties include `psgc_code` (a source canonical 10-digit code or empty), filesystem-safe `source_code`, `name`, `source_name`, `level`, `admin_type`, region/province/city/barangay codes, source parent names/PCODEs, source versions, match status/method/confidence and source file/index. Use `psgc_code || source_code` for a record identifier; source IDs are not official PSGC codes. Repeated canonical codes remain separate polygon records and receive the same joined value.

City scopes resolve the source `ADM3_PCODE` to that city's canonical PSGC; for example Cebu City uses `0730600000`, not its NAMRIA geographic ID `0702217000`. Province scopes retain NAMRIA geographic groupings, including NCR district-like units. HUCs and ICCs are administratively independent of those geographic provinces; use their **city** extract when a HUC/ICC is selected as a province-equivalent unit.

## Verified source and limits

As checked on October 20, 2026, the [latest source release](https://github.com/bendlikeabamboo/barangay-boundaries-repository/releases/tag/v2026.4.13.0) is `v2026.4.13.0`, but its geometry is based on **PSGC October 24, 2023** and **NAMRIA November 6, 2023**. Its upstream Douglas–Peucker tolerance is `0.005°`; preserving those coordinates does not restore original unsimplified coastlines. The release's date is not the administrative snapshot date.

The local full build preserves 17 region, 82 province, 1,635 city/municipal and 42,026 barangay polygon records. City records have 1,625 distinct canonical PSGC codes plus one unmatched record; barangays have 41,803 distinct codes. The [source classification report](https://github.com/bendlikeabamboo/barangay-boundaries-repository/releases/download/v2026.4.13.0/classification_report.json) identifies 230 PSGC entities without source polygons, including 198 barangays, and 14 missing Manila submunicipalities. It also contains fuzzy/repeated matches; polygon count is not a count of distinct places. These are countrywide historical extracts with explicitly incomplete coverage, not current complete official boundaries.

The source [license notes](https://github.com/bendlikeabamboo/barangay-boundaries-repository#license) distinguish MIT-licensed **code** from PSA PSGC and NAMRIA boundary **data attribution**. Keep credit to PSA and NAMRIA; do not describe all boundary data as MIT-licensed simply because the repository's code is MIT.

## Production Source Notes

The PSA PSGC API documentation lists `https://classification.psa.gov.ph/psgc` as the base URL and shows versioned level endpoints such as `Q2_2024/regions`, `Q2_2024/provinces`, `Q2_2024/municipalities`, and `Q2_2024/barangays`. The API requires a token.

HDX/OCHA boundary data should be treated as practical but indicative geometry. The metadata caveat in the project plan still applies: use the reconciliation report before claiming reliable barangay matching.
