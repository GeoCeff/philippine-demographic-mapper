# Changelog

All notable changes to this project will be documented here.

## Unreleased

### Changed

- Split the browser app monolith into focused classic-script modules for data fixtures, state, CSV parsing, matching, classification, render helpers, export/project persistence, and shared utilities.
- Updated `npm run check` so syntax validation covers every source module.
- Improved CSV import review with duplicate-code warnings, wrong-level detection, parent-scope validation, non-numeric value warnings, clearer issue rows, and issue CSV export.
- Added a smoke test for import matching behavior.
- Added a boundary-source selector and normalized GeoJSON renderer bridge so the SVG map can use generated pipeline output as well as built-in fixtures.
- Added export layout text controls for title, subtitle, and source note that render into the SVG and PNG output.
- Added GitHub Pages deployment, sample CSV documentation, an issue-demo CSV, and sample validation tests.

## 0.1.0 - 2026-06-08

### Added

- Local static prototype for creating Philippine choropleth maps.
- Simplified sample geography fixtures for region, province, city, and barangay workflows.
- CSV import and PSGC-code matching.
- Choropleth styling, missing-data styling, highlight styling, PNG export, and project JSON save/load.
- No-dependency PSGC/boundary reconciliation pipeline.
- Generated sample normalized boundary GeoJSON, lookup JSON, and reconciliation report.
- Project documentation, license, contribution guide, security policy, and GitHub issue templates.
