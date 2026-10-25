# Contributing

Thanks for helping improve Philippine Demographic Mapper.

## Development Setup

Requirements:

- Node.js 24, matching the CI runtime. No dependency installation is required.

Run the app:

```powershell
npm run boundaries:full
npm run serve
```

The complete pinned boundary build is needed once; verified cached downloads are reused. Open `http://127.0.0.1:4173/`. Without generated data, use the explicit demonstration boundary option rather than treating sample shapes as real geography.

Run the app and fixture regression checks:

```powershell
npm test
npm run boundaries:check
```

`npm test` covers the app, import/export, navigation, recovery, native geometry reader and output-failure fixtures. `boundaries:check` separately reads the existing complete raw/generated boundary package without rebuilding it. `npm run data:build` only regenerates the small `tools/fixtures` example; it does not build real countrywide data.

## Contribution Guidelines

- Keep changes scoped and easy to review.
- Preserve the local-first workflow.
- Document data-source assumptions and caveats.
- Preserve the historical dates, incomplete coverage and source attribution. Reconciliation is not legal-boundary certification.
- Prefer no-dependency scripts unless a dependency clearly earns its place.
- Avoid committing large raw GIS downloads. Put production inputs in `data/raw` locally and document how to reproduce generated outputs.
- Use synthetic or sanitized examples in tests, issues and pull requests. Project JSON, CSV files, screenshots and exports can contain private statistics, annotations and source details.

## Data Contributions

When improving boundary or PSGC handling, include:

- Source name and URL.
- Source version or retrieval date.
- Normalized field mapping.
- Reconciliation report changes.
- Any known mismatches, renamed places, duplicates, or geometry issues.

Keep every source polygon, including repeated PSGC assignments; record count and distinct-place count are different. Verify original islands/holes, hierarchy membership and hashes when changing the pinned package.

For custom reconciliation, pass separate output, report and metadata paths, as shown in [data/raw/README.md](data/raw/README.md). The general importer does not regenerate the active country's barangay index, scoped extracts or release hashes. Do not point it at `data/generated` or `data/source_metadata.json` while keeping that package active.

## Pull Requests

Please include:

- What changed.
- How it was tested.
- Any data caveats or follow-up work.

Use the private reporting route in [SECURITY.md](SECURITY.md) for exploitable issues.
