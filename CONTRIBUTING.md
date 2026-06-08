# Contributing

Thanks for helping improve Philippine Demographic Mapper.

## Development Setup

Requirements:

- Node.js 18 or newer.

Run the app:

```powershell
npm run serve
```

Run data checks:

```powershell
npm run data:build
npm run data:validate
npm run check
```

## Contribution Guidelines

- Keep changes scoped and easy to review.
- Preserve the local-first workflow.
- Document data-source assumptions and caveats.
- Do not claim official boundary accuracy unless the data has been reconciled and reviewed.
- Prefer no-dependency scripts unless a dependency clearly earns its place.
- Avoid committing large raw GIS downloads. Put production inputs in `data/raw` locally and document how to reproduce generated outputs.

## Data Contributions

When improving boundary or PSGC handling, include:

- Source name and URL.
- Source version or retrieval date.
- Normalized field mapping.
- Reconciliation report changes.
- Any known mismatches, renamed places, duplicates, or geometry issues.

## Pull Requests

Please include:

- What changed.
- How it was tested.
- Any data caveats or follow-up work.
