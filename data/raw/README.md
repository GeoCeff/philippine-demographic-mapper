# Raw Data Inputs

Place production source files here before running the data pipeline.

Build the real countrywide boundary package:

```powershell
npm run boundaries:barangays
```

`npm run data:build` separately exercises small fixtures under `tools/fixtures` and does not replace the real boundary package. For a custom source, run the pipeline directly with your source paths:

```powershell
node tools/data-pipeline.mjs --psgc data/raw/psgc_q2_2024.csv --boundaries data/raw/phl_admin_boundaries.geojson --out data/generated --report data/psgc_reconciliation_report.md --metadata data/source_metadata.json
```

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

Shapefiles should be converted to GeoJSON or another intermediate format before this no-dependency pipeline step.

## Open PSGC-Coded Boundaries

The app fetches the attributed PSA/NAMRIA geometry distributed by `bendlikeabamboo/barangay-boundaries-repository`. Its MIT license covers repository code, not a blanket license for the underlying boundary data:

```powershell
npm run boundaries:build
```

That builds real region, province, municipality, and city boundaries. Barangays are large, so fetch them only when needed:

```powershell
npm run boundaries:barangays
```

Downloaded source GeoJSON files stay under `data/raw/boundaries`, which is intentionally ignored by git.

For cleaner barangay borders, run `npm run boundaries:detail` after the base barangay build. It downloads the original 2023 NAMRIA/OCHA shapefile from the pinned `altcoder/philippines-psgc-shapefiles` community mirror at commit `a44a73091f19e4950dbdc0d7cb77a5e17b101a0a`, verifies component sizes/SHA-256, and stores originals under the ignored `boundaries/detail` directory. Generated city detail is gzip compressed and indexed separately from the lightweight country overview. Existing identifiers, attribution, source gaps and historical dates remain explicit.
