# Changelog

All notable changes to this project will be documented here.

## Unreleased

### Changed

- Split the browser app monolith into focused classic-script modules for data fixtures, state, CSV parsing, matching, classification, render helpers, export/project persistence, and shared utilities.
- Updated `npm run check` so syntax validation covers every source module.

## 0.1.0 - 2026-06-08

### Added

- Local static prototype for creating Philippine choropleth maps.
- Simplified sample geography fixtures for region, province, city, and barangay workflows.
- CSV import and PSGC-code matching.
- Choropleth styling, missing-data styling, highlight styling, PNG export, and project JSON save/load.
- No-dependency PSGC/boundary reconciliation pipeline.
- Generated sample normalized boundary GeoJSON, lookup JSON, and reconciliation report.
- Project documentation, license, contribution guide, security policy, and GitHub issue templates.
