# Adviser Demo Guide

Status: draft demo aid.

This short guide is for showing the Retirement Income Planner to an independent
financial adviser. It is not a request for the adviser to approve the software as
a regulated advice tool. The aim is to make review focused and practical: what
the app models, what it deliberately does not model, and where adviser judgement
is needed.

## 1. Suggested Demo Path

For the shortest adviser walkthrough, use `docs/adviser-demo-lite.md`: it keeps the live demo to three examples rather than the fuller worked-example pack.

1. Open or create a case. For a prepared walkthrough, restore one of the
   fictional full-case files in `examples/demo-cases/`.
2. Confirm the Case Details fields are filled in enough to identify the example:
   case name, reference, owner label, and notes.
3. Review the Dashboard assumptions:
   - personal details and retirement date;
   - guaranteed income;
   - DC pension pots;
   - tax-free accounts;
   - asset allocation mappings and growth-rate assumptions;
   - tax rule pack or custom tax settings;
   - drawdown strategy and drawdown order.
4. Review the Dashboard outputs:
   - sustainability summary;
   - income breakdown chart;
   - year-by-year table;
   - expanded year workings;
   - internal consistency checks.
5. Open the Review page and explain the intended retirement-date workflow:
   reviews record actual balances and income, then optionally update the current
   projection basis.
6. Use Save Case / Restore Case to show that a full case file includes the plan,
   case details, Review history, and What If scenarios.
7. Use the adviser checklist to record decisions, caveats, and missing rules.

## 2. What To Ask The Adviser To Review

Ask for feedback on the planning model, not the source code.

Key questions:

- Are the modelled income sources and drawdown mechanics appropriate for initial
  retirement-income planning conversations?
- Are the tax rule packs and stated exclusions clear enough for UK / Isle of Man
  review?
- Which assumptions need stronger user-facing caveats?
- Which missing rules would materially affect adviser confidence?
- Which additional worked examples would be most useful before wider use?

## 3. Language To Use During The Demo

Use careful assurance wording:

- Say: "The tests show the app is internally consistent against the documented
  model and worked examples."
- Say: "The adviser review is to validate whether that model and its assumptions
  are appropriate for planning use."
- Avoid: "The app proves the numbers are correct."
- Avoid: "The app provides financial advice."
- Avoid: "The projection is guaranteed."

## 4. Documents To Have Ready

- `docs/adviser-review-pack.md` - model overview and review questions.
- `docs/adviser-review-checklist.md` - response template for decisions and
  caveats.
- `docs/calculation-spec.md` - detailed calculation rules.
- `docs/calculation-assumptions.md` - simplifications and exclusions.
- `docs/calculation-worked-examples.md` - generic hand-checkable examples.
- `docs/isle-of-man-worked-examples.md` - Isle of Man 2026-27 tax examples.
- `docs/investment-assumptions-and-asset-mapping.md` - allocation mapping and
  historical proxy caveats.
- `docs/test-coverage-review.md` - assurance trail and current test coverage.
- `docs/case-persistence-and-review-semantics.md` - Save Case / Restore Case
  semantics.
- `examples/demo-cases/README.md` - fictional full-case files for live adviser
  walkthroughs.

## 5. Known Demo Caveats

- The app is local-first. Case data is stored in the browser and in user-saved
  JSON files, not in a cloud account.
- The normal projection is deterministic and does not model investment
  volatility or sequence-of-returns risk directly.
- Tax treatment is limited to the implemented rule-pack scope and explicit
  exclusions.
- Asset allocation mappings are broad planning assumptions selected by the user
  or adviser, not provider fund-specific validations.
- The app does not replace personalised regulated financial advice.
- Full-case files are the recommended demo format. Config-only files are an
  advanced/backwards-compatible option and exclude case details, Review history,
  and What If scenarios.
