# Demo Case Files

These JSON files are fictional full-case exports for adviser walkthroughs and local
smoke testing. They are not client data and should not be treated as adviser-
approved examples.

Use them through the app's primary **Restore Case** flow. A full case includes the
current planner config, case details, Review history, and What If scenarios.

## Files

| File | Purpose |
| --- | --- |
| `rip_full_case_demo-uk-baseline_2026-05-12.json` | Pre-retirement UK England/Wales/NI example with DC pots, ISA/cash accounts, and two What If scenarios. |
| `rip_full_case_demo-isle-of-man_2026-05-12.json` | Isle of Man resident example using the `IM-2026-27` tax rule pack, intended to prompt adviser review of IoM treatment and exclusions. |
| `rip_full_case_demo-post-retirement-review_2026-05-12.json` | Post-retirement example with a locked baseline and two Review snapshots, showing how actual balances/income update the current projection basis. |

## Demo notes

- Figures are deliberately plausible but fictional.
- Tax treatment follows the current app rule packs and known exclusions.
- Each DC pot and ISA/tax-free account includes an explicit broad asset allocation
  mapping so the adviser can challenge the growth/historical-proxy assumptions
  during the walkthrough.
- These files demonstrate app workflow and data portability; they do not prove
  that any tax/planning treatment is adviser-approved.
- For the live walkthrough path, see `docs/adviser-demo-guide.md`.
