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
```

`npm run data:build` uses sample fixtures so the workflow is testable without a PSA token or a large HDX download.

## Production Source Notes

The PSA PSGC API documentation lists `https://classification.psa.gov.ph/psgc` as the base URL and shows versioned level endpoints such as `Q2_2024/regions`, `Q2_2024/provinces`, `Q2_2024/municipalities`, and `Q2_2024/barangays`. The API requires a token.

HDX/OCHA boundary data should be treated as practical but indicative geometry. The metadata caveat in the project plan still applies: use the reconciliation report before claiming reliable barangay matching.
