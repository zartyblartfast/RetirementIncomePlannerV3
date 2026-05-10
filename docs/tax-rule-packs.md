# Tax Rule Packs

This document describes the tax-rule-pack direction for jurisdiction-specific
tax modelling.

The app keeps the existing `Custom` tax model. Rule packs add named,
versioned jurisdiction defaults that can be selected in configuration.

For the longer-term design direction, including income events, code-driven
modules, self-documenting rule metadata, and residency timelines, see
`docs/tax-architecture-roadmap.md`.

## Current Packs

| Pack | Tax year | Status | Scope |
| --- | --- | --- | --- |
| `GB-EWNI-2026-27` | 2026-27 | Initial implementation | UK England, Wales, and Northern Ireland income tax bands for pension/ordinary income. |
| `GB-SCT-2026-27` | 2026-27 | Initial implementation | Scottish income tax bands for pension/ordinary income. |
| `IM-2026-27` | 2026-27 | Initial implementation | Isle of Man resident income tax bands for pension/ordinary income. |

## Current Rule Coverage

Implemented:

- Personal allowance.
- UK personal allowance taper above `100000`.
- Progressive income tax bands.
- Basic pension/ordinary-income treatment.
- ISA/tax-free account withdrawals remain outside taxable income.

Not yet implemented:

- National Insurance.
- Savings and dividend tax.
- Capital gains tax.
- Marriage Allowance, Blind Person Allowance, or age-related allowances.
- Isle of Man joint assessment and married/civil-partner allowance rules.
- Isle of Man tax cap elections. The cap amount is recorded in the pack, but
  it is not enabled automatically.
- Residency and treaty cases.
- US state, Canadian province, or other regional systems.

## Source Policy

Each pack should include:

- Official source URLs.
- Date checked.
- Tax year.
- Known exclusions.
- Worked examples or adviser-approved test cases.

Current worked-example documents:

- `docs/calculation-worked-examples.md` for generic projection mechanics.
- `docs/isle-of-man-worked-examples.md` for the Isle of Man 2026-27 rule pack.

Reference guides from PwC, EY, Deloitte, KPMG, IBFD, and OECD can help research
and cross-check rules, but app calculations should use official government
sources where possible.

The Isle of Man pack uses the Isle of Man Government tax practice notes as the
official source trail, with PwC Worldwide Tax Summaries as a cross-check for the
resident allowance, standard-rate band, higher rate, allowance taper, and tax
cap.

## Implementation Notes

The first implementation lives in `src/engine/taxRulePacks.ts`.

Rule packs currently compile down to the existing `TaxConfig` shape plus an
optional `personal_allowance_taper`. This is enough for the first UK packs, but
it is not expected to cover every jurisdiction. More complex jurisdictions may
need code-driven rule functions as well as data tables.

The current implementation should therefore be treated as the first simple
banded-tax implementation, not the final architecture for all jurisdictions.
