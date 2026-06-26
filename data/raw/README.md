# Raw Data Inputs

Place production source files here before running the data pipeline.

Recommended first run:

```powershell
npm run data:build
```

That command uses the small fixtures in `tools/fixtures`. For production data, run the pipeline directly with your source paths:

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

The app can also fetch the MIT-licensed `bendlikeabamboo/barangay-boundaries-repository` release data:

```powershell
npm run boundaries:build
```

That builds real region, province, municipality, and city boundaries. Barangays are large, so fetch them only when needed:

```powershell
npm run boundaries:barangays
```

Downloaded source GeoJSON files stay under `data/raw/boundaries`, which is intentionally ignored by git.
