# Changelog

All notable changes to this project will be documented here.

## Unreleased

### Repository

- Refresh the README with an illustrative showcase, current setup/user guide, privacy/recovery behavior, data provenance and measured-next-step roadmap. Align contribution/security guides, data guides and issue/PR templates with the current editor and pinned full-build workflow.
- Update application/repository descriptions, homepage/topics and share metadata; retain explicit historical-data limitations.

### Changed

- Harden CSV/project trust boundaries, preserve small nonzero statistics, protect issue metadata, and collapse constant-value color scales. Validate complete project candidates and keep imported colors inert.
- Fix stale boundary retries, overview downgrades and detailed-border eligibility in smaller regional maps. Cancel obsolete requests and expose loading/partial/fallback detail status. Add native two-finger pinch navigation.
- Add local recovery with explicit Restore/Discard, bounded undo/redo, New, saved cameras, metric metadata/precision and source-version notices. Add Focus map, export page preview, border presets and complete mobile background isolation; group map text controls in Appearance.
- Preserve edits made while local recovery is being cleared, serialize deletion after pending saves, and invalidate deleted durable state without immediately recreating an unchanged recovery copy.
- Make boundary checks read-only and validate every detailed chunk against original geometry. Stage/rollback data output sets, validate custom polygons, support dense bounds and handle local-server errors without terminating the process.
- Load original 2023 barangay geometry for province/city views and bounded zoomed overview areas, retaining all 42,026 curated records and original holes/islands. Add reproducible checksum-verified native SHP/SHX/DBF extraction, gzip city detail and explicit overview fallbacks. Replace national per-place SVG nodes with color batches, viewport culling and spatial hit testing; cache geography/search hierarchy lookups and tooltip content while preserving editable places and vector export.
- Restyle the editor with monochrome surfaces, self-hosted Geist/Geist Mono/Geist Pixel fonts, numbered tool sections, soft map framing and a restrained halftone brand. Add persistent System/Light/Dark themes without changing project or export colors; preserve full-canvas navigation, readable mobile controls, keyboard focus and reduced-motion support.
- Add customizable legend titles, group labels/colors, palette reversal, missing-data entries, card/text styling, opacity and typography. Arrange the legend/title/subtitle/source with dragging, keyboard nudges, percentage controls and presets; persist bounded relative positions and export without editing handles. Validate imported settings and restore defaults for older projects. Suppress rectangular SVG focus/native-drag boxes during pointer gestures while retaining boundary-shaped keyboard focus.
- Explain place identifiers, exact place types and parent areas in shared hover/editor details. Show the named statistic, CSV/manual source, annotations and specific missing-value reasons; keep hover cards within the map and dismiss stale cards on redraw. Clarify import/export help, search context and import row contents without duplicating problem rows. Blank or formatting-only numeric cells remain missing instead of becoming zero.
- Use the full map canvas instead of a narrow portrait frame. Fit to the available aspect ratio without stretching boundaries, preserve zoom and center across resizing, and rebuild the title/legend layout to keep text undistorted.
- Fix map dragging so the background, title, legend and clipping frame stay aligned throughout the gesture. Add cursor-anchored wheel zoom, scope-relative zoom limits and robust pointer cleanup. Navigation preserves boundary nodes and refreshes labels after movement settles.
- Replace stacked controls with a map-first workspace, four task tabs, a contextual place editor and one mobile tools sheet. Add plain-language labels, filtered area navigation, guided image downloads, keyboard focus handling, import replacement choices and place drafts that survive panel changes. Keep selected-place statistics in their original color, emphasizing selection with an outline.
- Default to real historical Philippine boundary geometry; derive scopes from canonical source codes, preserve islands/holes, and align every independently loaded scope in one projection.
- Build and index national, regional, provincial and city barangay packages, preserve unmatched/repeated records, and expose source versions, checksums and coverage gaps.
- Add per-place CSV/manual labels and statistics, zoom/pan, child-map navigation, downloadable templates, collision-aware labels and an exported map legend. Project JSON now retains manual edits and label settings.
- Keep fixture builds separate from real map outputs and build the pinned boundary package for GitHub Pages.
- Make exact-code searches work with Enter and update statistic headings while typing. Keep source notes at the bottom of small scopes, and preserve the preview extent and background when exporting different image proportions.
- Corrected custom classification: ignore blank/duplicate thresholds, interpolate enough colors for every class, and label open-ended legend boundaries. Imported bin counts are rounded and limited to the existing 3–7 range.
- Added classification regression checks to the existing smoke suite.
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
