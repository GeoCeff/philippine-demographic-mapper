# Security Policy

## Supported Versions

Security fixes target the latest commit on `master`. Historical tags are not a separately maintained security branch. Automated checks are useful evidence, not a security certification.

## Local Data and Hosting

The app is a static, local-first editor. Imported CSV/project contents are processed in the browser; the app has no account or import-upload service. Public boundary downloads and static hosting still make network requests.

Local recovery uses IndexedDB in the current browser and origin, including imported rows, annotations and unfinished place drafts. There is one recovery slot per origin; use one active project tab to avoid replacing another tab's recovery copy. **Clear local recovery** removes that copy; it does not remove downloaded project files, images or CSVs. Treat shared browser profiles and exported files accordingly.

The development server binds to `127.0.0.1` and serves its working directory. It is a local development tool without authentication; do not expose it as a public file server. Keep private data and credentials out of public repository files and deployment assets.

CSV and project JSON are untrusted inputs. Validation limits malformed data and imported styles, but users should still use trusted files and current browsers. Do not put private datasets into public bug reports to demonstrate an import failure.

## Reporting a Vulnerability

Use [GitHub's private vulnerability reporting page](https://github.com/GeoCeff/philippine-demographic-mapper/security/advisories/new), which is enabled for this repository. If the service is unavailable, contact the repository owner privately through an existing contact channel; do not open a public exploit report or post credentials/private data.

Include:

- A short description of the issue.
- Steps to reproduce.
- Commit/version, browser/OS and whether the issue occurs locally or on the hosted app.
- Expected impact.
- A minimal synthetic reproduction and any suggested fix.

Please do not publicly disclose exploitable issues until there has been time to review and patch them.
