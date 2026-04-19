# Phase 2 — Compliance Hardening and KPI Governance

This pass introduces a formal Phase 2 foundation for compliance hardening.

## What is now added

- Dedicated backend compliance router at `/api/compliance/*`
- Water quality and regulatory compliance module that clearly separates:
  - operational proxy indicators already available in the RawData model
  - formal laboratory/regulatory metrics that are **not yet present** in the source schema
- KPI governance register with owner, formula, benchmark treatment, and chart-usage guidance
- System-wide data-quality status scoring based on field completeness across key governed fields
- Minimal frontend page entry for `Water Quality & Regulatory Compliance`
- Legacy compatibility import package for `services.*` test imports

## Institutional interpretation rule applied

This implementation follows the correct reporting principle:

- Actual target/benchmark lines are only appropriate where the KPI is inherently benchmarkable and analytically comparable.
- Elsewhere, the system provides benchmark **context notes** rather than forced chart lines.

## Important current limitation

The current operational upload schema does **not** yet contain true laboratory and regulatory compliance fields such as:

- residual chlorine result compliance
- turbidity compliance
- bacteriological sample compliance
- sampling-plan completion rates
- exceedance / permit breach logs

Accordingly, the module reports a `partial` compliance position instead of implying false statutory compliance.

## Recommended next build items

1. Extend upload schema and parser with governed laboratory-result columns.
2. Add a compliance returns template for water quality teams.
3. Add board-approved definitions for service continuity and drinking-water thresholds.
4. Add audit/versioning for KPI definitions and benchmark changes.

## Direct file edits applied in this build

This build now includes direct source-file edits for Phase 2 governance hardening:

- backend governance registries for chart-level benchmark legitimacy and page-level visual standards
- new compliance API endpoints for chart standards, page standards, and a combined governance bundle
- frontend benchmark pills and notes now consult the governed registry first, with fallback logic only when a chart has not yet been registered
- compliance page now exposes page visual standards and a chart governance register so users can see why a target line, threshold band, or context note is being used
- print styles now preserve governance tables in board-pack output

Institutional rule now enforced in the frontend and backend:

> Use a literal target line only where the KPI has a legitimate approved comparator or accepted benchmark. Otherwise use a threshold band, control limit, or interpretation note.
