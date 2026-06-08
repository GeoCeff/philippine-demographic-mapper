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
