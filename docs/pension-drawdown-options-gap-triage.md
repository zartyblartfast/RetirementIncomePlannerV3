# Pension Drawdown Options Gap Triage

Status: quick triage of an additional YouTube-derived pension drawdown reference against the current `demo` / Dev03 app state.

This note is not a source-verified implementation specification. Any item promoted into code or adviser-facing copy should still be checked against HMRC / GOV.UK / adviser sources, especially post-2024 LSA / LSDBA and post-April-2027 IHT treatment.

## Short conclusion

The current app already covers the core path we have been prioritising:

- phased crystallisation / PCLS as a capital event;
- taxable flexi-access drawdown from crystallised funds;
- MPAA distinction between PCLS-only and taxable drawdown;
- crystallised vs uncrystallised ledger state;
- guarded ledger-aware ordinary FAD withdrawals;
- explicit caveats that LSA / LSDBA are not fully numerically enforced.

The extra reference is still useful because it highlights three good adviser-demo questions and several future feature areas. For the upcoming adviser demo, do not broaden the demo; use these as prompts to ask what matters next.

## Already well covered in the current model

| Topic from reference | Current app / docs state | Demo stance |
| --- | --- | --- |
| FAD: PCLS separate from taxable drawdown | Covered. PCLS/crystallisation events are separate from taxable FAD events. PCLS does not inflate taxable income. Taxable FAD is 100% taxable and consumes crystallised drawdown balance. | Show this as Example 3 in the lite demo. |
| PCLS-only does not trigger MPAA | Covered in the ledger/event model and warnings. | Make this one of the key adviser validation points. |
| First taxable FAD income triggers MPAA | Covered for explicit FAD events and ledger-aware ordinary FAD withdrawals. | Show warning/caveat briefly, not as a deep tax lecture. |
| Phased drawdown as strategy rather than separate product | Covered in design docs: crystallisation/PCLS + taxable FAD as a compound workflow. | Use plain English: “phased crystallisation and drawdown”. |
| Uncrystallised vs crystallised growth status | Covered as a ledger side-channel with proportional growth attribution; caveat that separate growth rates are not yet modelled. | Mention as current simplifying assumption. |
| UFPLS vs phased distinction | Covered in research docs and internal event types; UFPLS deliberately not prominent in UI yet. | Ask whether UFPLS needs to be promoted or can remain secondary. |
| State Pension as taxable guaranteed income | The engine supports taxable guaranteed income. Current app does not yet auto-calculate SPA or ask for State Pension forecast in a rich way. | Demo as configured input, not automated advice. |

## Partially covered / caveated

| Topic | Current state | Suggested next treatment |
| --- | --- | --- |
| LSA / LSDBA | Ledger state and warnings/caveats exist, but full numerical allowance enforcement is not complete. | Keep as explicit demo caveat. Ask adviser how important this is before wider use. |
| Emergency tax / P55 reclaim workflow | Recognised in research, but not implemented as a UI workflow. | Good future warning feature, especially if UFPLS is exposed. Not needed for the current three-example demo. |
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

Do not add more examples before the meeting. The extra material strengthens the questions we ask, not the number of scenarios we show.

Add these as optional adviser prompts:

1. Is phased crystallisation / PCLS / taxable FAD the right primary route for the app to model first, with UFPLS secondary?
2. Should small pots and trivial commutation be treated as visible options or just caveated edge cases?
3. Would an annuity-floor comparison be useful enough to prioritise, or would it distract from drawdown planning?
4. Which warnings are essential before real-case use: MPAA, emergency tax/P55, LSA, provider compatibility, Pension Wise, recycling, or minimum pension age?
5. Should the next implementation focus on better pension-access warnings, State Pension age/forecast support, or annuity/hybrid comparisons?

## Suggested roadmap impact

For the demo branch:

- Keep the three-example demo unchanged.
- Add this triage note as a behind-the-scenes reference only.
- If time permits, mention “we have deliberately not yet modelled small pots, annuities, death benefits, or contribution-allowance planning; I’d like your view on which matter.”

For future implementation, the most credible next slices are:

1. Warning/caveat pass: emergency tax/P55, Pension Wise, minimum pension age, provider compatibility, LSA/LSDBA scope.
2. State Pension helper: DOB-derived SPA and editable State Pension forecast support.
3. Small pots/trivial commutation detection if adviser says common enough.
4. Annuity floor comparison as a planning scenario, not a recommendation engine.
5. UFPLS event implementation only if adviser says it needs to be first-class rather than secondary.
