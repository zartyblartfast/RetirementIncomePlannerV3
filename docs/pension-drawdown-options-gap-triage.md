# Pension Drawdown Options Gap Triage

Status: quick triage of an additional YouTube-derived pension drawdown reference against the current `demo` / Dev03 app state.

This note is not a source-verified implementation specification. Any item promoted into code or adviser-facing copy should still be checked against HMRC / GOV.UK / adviser sources, especially post-2024 LSA / LSDBA and post-April-2027 IHT treatment.

## Updated conclusion after consolidated adviser-video review

The consolidated adviser-video pattern changes the product framing slightly. The app should treat **UFPLS** and **Phased FAD** as the two primary drawdown engines:

1. **UFPLS path** — for users who mainly want to take one-off or regular lump sums directly from uncrystallised funds. Simple 25% tax-free / 75% taxable treatment, but first payment triggers MPAA and may involve emergency-tax/P55 issues.
2. **Phased FAD path** — for users who want a planned multi-year retirement-income strategy. Crystallise in slices, take PCLS separately, preserve tax-free entitlement on uncrystallised growth, and draw taxable income from crystallised funds when needed.

Full crystallisation should be demoted from a strategy choice to a warning/comparison column: it helps explain what the app is avoiding, but should not be presented as a recommended normal route.

The current app is strongest on the Phased FAD path. It has the ledger, PCLS, taxable FAD, and ledger-aware ordinary FAD pieces. UFPLS is recognised structurally and in research, but it is not yet a polished first-class calculator/planner path. That is the main functional gap exposed by the video synthesis.

## Already well covered in the current model

| Topic from reference | Current app / docs state | Demo stance |
| --- | --- | --- |
| FAD: PCLS separate from taxable drawdown | Covered. PCLS/crystallisation events are separate from taxable FAD events. PCLS does not inflate taxable income. Taxable FAD is 100% taxable and consumes crystallised drawdown balance. | Show this as Example 3 in the lite demo. |
| PCLS-only does not trigger MPAA | Covered in the ledger/event model and warnings. | Make this one of the key adviser validation points. |
| First taxable FAD income triggers MPAA | Covered for explicit FAD events and ledger-aware ordinary FAD withdrawals. | Show warning/caveat briefly, not as a deep tax lecture. |
| Phased drawdown as strategy rather than separate product | Covered in design docs: crystallisation/PCLS + taxable FAD as a compound workflow. | Use plain English: “phased crystallisation and drawdown”. |
| Uncrystallised vs crystallised growth status | Covered as a ledger side-channel with proportional growth attribution; caveat that separate growth rates are not yet modelled. | Mention as current simplifying assumption. |
| UFPLS vs phased distinction | Covered in research docs and internal event types, but UFPLS is not yet a polished first-class calculator/planner path. | Treat this as the main gap if the adviser agrees UFPLS must sit alongside Phased FAD. |
| State Pension as taxable guaranteed income | The engine supports taxable guaranteed income. Current app does not yet auto-calculate SPA or ask for State Pension forecast in a rich way. | Demo as configured input, not automated advice. |

## Partially covered / caveated

| Topic | Current state | Suggested next treatment |
| --- | --- | --- |
| LSA / LSDBA | Ledger state and warnings/caveats exist, but full numerical allowance enforcement is not complete. | Keep as explicit demo caveat. Ask adviser how important this is before wider use. |
| Emergency tax / P55 reclaim workflow | Recognised in research, but not implemented as a UI workflow. | Higher priority if UFPLS becomes one of the two primary engines. |
| Provider compatibility | Caveated, not modelled. | Add to adviser questions: which provider limitations matter most? |
| Scottish taxpayer status | Tax packs exist for implemented regions, but automatic postcode detection is not the right first priority. | Keep manual selection / caveat. |
| Personal allowance taper over £100k | Known limitation in the app. | Caveat for high-income cases; not core to the demo examples unless relevant. |
| Pension Wise prompt | Not implemented. | Low-cost future UX/caveat item if adviser thinks it matters. |
| Pension recycling rule | Not implemented. | Future warning if the app starts modelling post-PCLS contributions. Not needed for current drawdown demo unless contributions are modelled. |
| Tapered annual allowance / carry forward | Not implemented. | Future contributions-planning module, separate from retirement-income projection. |

## Genuine future feature areas not currently covered

| Topic | Why it matters | Recommended priority |
| --- | --- | --- |
| Small pots lump sums | Different MPAA / LSA treatment from UFPLS; useful for scattered sub-£10k pots. | Medium, if adviser confirms clients often have small legacy pots. |
| Trivial commutation | Applies when total pension rights are small; probably less relevant to the current target user with material DC pots. | Low for this app unless adviser says otherwise. |
| Annuities | Important retirement option and useful for guaranteed income floor comparisons. | Medium/high as a future planning comparison, but it needs external/current annuity-rate assumptions and careful caveats. |
| Hybrid annuity floor + drawdown | Potentially valuable adviser-facing planning concept. | Good future roadmap item after adviser feedback. Could start as an illustrative comparison, not a recommendation engine. |
| Death benefits / IHT post-April-2027 | Important for legacy planning but broadens the app beyond income drawdown. | Future module; do not add before adviser demo. |
| State Pension age / deferral helper | Useful and adviser-visible. | Good UX follow-up: calculate/display SPA from DOB, but keep editable and source-labelled. |

## Adviser-demo implications

Do not add many more examples before the meeting. But adjust the positioning: the app is moving toward **two engines** — UFPLS and Phased FAD — with the demo currently showing the Phased FAD engine more completely.

Add these adviser prompts:

1. Do you agree that UFPLS and Phased FAD are the two main drawdown engines the app should present?
2. Is it acceptable that the current demo is strongest on Phased FAD, while UFPLS is still a roadmap item?
3. Should full crystallisation be kept only as a warning/comparison column rather than a normal strategy?
4. Should small pots and trivial commutation be auto-detected opportunities rather than primary strategy choices?
5. Should annuity/hybrid sit before the drawdown-path choice as a separate “guaranteed income vs flexibility” decision?
6. Which warnings are essential before real-case use: MPAA, emergency tax/P55, LSA, provider compatibility, Pension Wise, recycling, or minimum pension age?

## Suggested roadmap impact

For the demo branch:

- Keep the three-example demo unchanged.
- Add this triage note as a behind-the-scenes reference only.
- If time permits, mention “we have deliberately not yet modelled small pots, annuities, death benefits, or contribution-allowance planning; I’d like your view on which matter.”

For future implementation, the most credible next slices are:

1. UFPLS calculator/planner path: one-off/regular UFPLS, 25% tax-free / 75% taxable, MPAA trigger, emergency-tax/P55 warning.
2. Warning/caveat pass: Pension Wise, minimum pension age, provider compatibility, LSA/LSDBA scope, recycling if contributions are modelled.
3. State Pension helper: DOB-derived SPA and editable State Pension forecast support.
4. Small pots/trivial commutation auto-detection, if adviser confirms these should be surfaced.
5. Annuity floor / hybrid comparison as a separate pre-drawdown decision, not a third drawdown engine.
