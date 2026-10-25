# Raw Data Inputs

Downloaded boundary sources and optional custom inputs live here. Contents are ignored by git except this guide; preserve original files and their provenance.

Build the real countrywide boundary package:

```powershell
npm run boundaries:full
```

This builds the pinned historical overview and original scoped detail, then validates them. `npm run boundaries:check` only reads the existing package, including cached source hashes. Missing or changed inputs fail validation.

`npm run data:build` separately exercises small fixtures under `tools/fixtures` and does not replace the real boundary package. For custom reconciliation, use isolated output, report and metadata paths:

```powershell
node tools/data-pipeline.mjs --psgc data/raw/custom_psgc.csv --boundaries data/raw/custom_boundaries.geojson --out data/generated/custom-review --report data/generated/custom-review/reconciliation.md --metadata data/generated/custom-review/source_metadata.json
```

The general importer produces normalized admin boundaries, a lookup, report and custom metadata. It does not regenerate the country's barangay index, scoped extracts, detail chunks or release hashes. Do not target the active `data/generated` root or `data/source_metadata.json` with this command. Review custom outputs before a separate integration change.

## Expected Inputs

- PSGC: CSV or JSON records with PSGC code, name, level, and optional parent codes.
- Boundaries: GeoJSON FeatureCollection with polygon or multipolygon geometries.

The pipeline normalizes common PSA and HDX/OCHA-style field names into:

- `psgc_code`
- `name`
- `level`
- `region_code`
- `province_code`
- `city_municipality_code`
- `barangay_code`
- `source_version`

The general importer accepts GeoJSON, so arbitrary shapefiles require separate conversion. The pinned detail builder already reads the specific original WGS84 ADM4 SHP/SHX/DBF source with the native reader; it is not a general CRS/conversion tool.

## Open PSGC-Coded Boundaries

The boundary fetcher downloads attributed PSA/NAMRIA geometry from the pinned `v2026.4.13.0` release of `bendlikeabamboo/barangay-boundaries-repository`. Its MIT license covers repository code, not a blanket license for the underlying boundary data. The lower-level admin-only build is:

```powershell
npm run boundaries:build
```

That builds real region, province, municipality, and city boundaries. The lower-level overview build including barangays is:

```powershell
npm run boundaries:barangays
```

These lower-level builds can replace the detail index. Follow them with `npm run boundaries:detail` and `npm run boundaries:check`, or use `boundaries:full` for the complete sequence. Downloaded source files stay under `data/raw/boundaries`.

For cleaner barangay borders, run `npm run boundaries:detail` after the base barangay build. It downloads the original 2023 NAMRIA/OCHA shapefile from the pinned `altcoder/philippines-psgc-shapefiles` community mirror at commit `a44a73091f19e4950dbdc0d7cb77a5e17b101a0a`, verifies component sizes/SHA-256, and stores originals under the ignored `boundaries/detail` directory. Generated city detail is gzip compressed and indexed separately from the lightweight country overview. Existing identifiers, attribution, source gaps and historical dates remain explicit.

Do not commit private imports, credentials or exports here or elsewhere in the public repository. Share only sanitized fixtures when reporting a problem.
