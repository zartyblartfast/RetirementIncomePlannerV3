# Case persistence and Review update semantics

This note documents the current local-first case model so Review behaviour is explicit rather than accidental.

## Current storage model

All user financial data remains local-only:

- Current live config: browser `localStorage` key `rip_v2_config`.
- Review baseline/history: browser `localStorage` key `rip_v2_reviews`.
- What If scenarios: browser `localStorage` key `rip_v2_scenarios`.
- File backups: user-initiated JSON downloads/imports.

No account, telemetry, cloud database, or remote sync is introduced by this feature.

## Full case file

The full case export is a single JSON file with:

- `schema: "rip.full_case"`
- `version: 1`
- `exported_at`
- `app: "RetirementIncomePlannerV3"`
- `config`: the current live `PlannerConfig`
- `review_store`: locked baseline plus review snapshots
- `scenarios`: saved What If scenario snapshots

The intent is that a user can restore the complete local planning case, not just the current config. This is more robust than exporting only `rip_v2_config`, because Review history and baseline comparisons are otherwise easy to lose when moving browsers or devices.

Config-only export/import remains available for backwards compatibility and simple examples, but it should be described as "config only" because it does not include Review history or scenarios.

## Review save semantics

A Review save is a live update operation plus a history record:

1. Record the review snapshot:
   - review month
   - current pot/account balances
   - net income drawn since last review
   - current monthly guaranteed income amounts
   - strategy and tax context at review time
   - notes
2. Update the current live config with reviewed pot/account balances and `values_as_of` dates.
3. Handle guaranteed income explicitly:
   - default: update current guaranteed-income assumptions for future projections by converting the entered monthly amount to annual gross and setting `values_as_of` to the review month;
   - optional: record only, leaving the current guaranteed-income assumptions unchanged.

This means State Pension or other guaranteed-income changes are no longer silently ambiguous. The Review form tells the user whether the entered guaranteed income will update future projections, and the history row records whether it was applied or recorded only.

## What this does not yet do

This is not a full historical case ledger. It does not yet preserve every pre-review config snapshot before each Review save. The current baseline remains one locked reference config, and Review snapshots remain chronological records.

A richer future ledger could add:

- case/client name and reference
- created/updated dates
- pre-review and post-review config snapshots per review event
- explicit re-baseline events
- multi-case management in localStorage

Those should be added after the full-case import/export path is stable.
