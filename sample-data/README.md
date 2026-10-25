# Sample CSVs

These are small, illustrative importer fixtures. Their values, including `households`, are examples rather than sourced demographic observations; the files are not complete national datasets.

- `region_values.csv`: example region-level rows.
- `province_values.csv`: example province-level rows.
- `barangay_values.csv`: example Quezon City barangay rows used by the demonstration fixtures.
- `match_issues_demo.csv`: intentionally messy rows for testing duplicate, missing, wrong-level, outside-scope, unknown-code, and invalid-value review states.

For real boundaries, choose the area and map level in **Places**, then use **Data → Download CSV template**. That template uses identifiers from the loaded historical source; demonstration codes/names need not match that source. Keep PSGC codes as text so spreadsheet software preserves leading zeros.

Import your file in **Data**, select the statistic and optional label columns, and inspect **Review import** before interpreting colors. A blank value is missing; numeric zero is a valid value. Use **Metric details and local recovery** to record units, period and source for actual observations.

Imports are processed in the browser and may be retained in local recovery or downloaded project JSON. Use sanitized data for public issue examples; do not attach private CSVs, projects or screenshots.
