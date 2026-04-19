# Phase 3 — Report Density Controls

This phase implements progressive disclosure across the standard report pages so users do not see full-density tables and secondary analysis by default.

## What changed

- Added a report view-mode selector in the top toolbar with **Summary**, **Analysis**, and **Detail** states.
- Applied the density control to the standard report pages:
  - Production & NRW
  - Water Treatment & Energy
  - Customers
  - Connections
  - Stuck Meters
  - Connectivity
  - Breakdowns
  - Pipelines
  - Billed Amount
  - Billing & Collections
  - Service Charges & Meter Rental
  - Operating Expenses
  - Debtors
- Added a page-level density note under the report header to explain the current viewing mode.
- Detailed tables are now hidden by default in **Summary** and **Analysis** mode and can be revealed with a dedicated disclosure button.
- The chosen view mode is persisted in local storage so the user keeps the same density preference across pages.

## Behaviour

### Summary
Shows the KPI row and the primary chart first, with the detailed table hidden until requested.

### Analysis
Shows the KPI row, the main trend, and the supporting chart section, with the detailed table still hidden until requested.

### Detail
Shows the full report page including all charts and the detailed table.

## Why this matters

This change reduces information overload without removing reporting depth. Managers and operations staff can start from a lighter page state, then progressively reveal detail only when they need it.
