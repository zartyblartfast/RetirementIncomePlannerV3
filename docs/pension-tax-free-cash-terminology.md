# Pension Tax-Free Cash Terminology

**Context:** Retirement Income Planner V3  
**Purpose:** plain-English glossary for pension tax-free-cash research, adviser conversations, and future feature scoping  
**Status:** explanatory aid only; verify official definitions before using in calculation logic or adviser-facing wording

---

## Why this glossary exists

UK pension tax-free-cash discussions quickly become acronym-heavy. This document gives a plain-English reference for the terms most likely to appear in RIP research and future modelling discussions.

It deliberately separates:

- what the term broadly means;
- why it matters for RIP;
- whether the app currently models it.

The current RIP baseline remains simple: each modelled DC pension withdrawal can be split between tax-free and taxable portions using the pot's configured `tax_free_portion`, usually 25% tax-free / 75% taxable. That is a gradual pro-rata cash-flow approximation, not a full crystallisation model.

---

## Quick acronym table

| Acronym / term | Stands for | Plain-English meaning | RIP status |
|----------------|------------|-----------------------|------------|
| DC | Defined Contribution | Pension pot where value depends on contributions and investment returns. | Modelled. |
| DB | Defined Benefit | Pension promising income based on salary/service rules. | Modelled only as guaranteed income, not as DB scheme rules. |
| PCLS | Pension Commencement Lump Sum | Usually the tax-free cash taken when pension benefits start / are crystallised. | Not modelled as an explicit event. |
| TFC | Tax-Free Cash | General informal phrase for tax-free pension lump sums or tax-free portions. | Modelled only as gradual pro-rata per-withdrawal split. |
| FAD | Flexi-Access Drawdown | Crystallised pension funds remain invested and taxable income can be drawn flexibly. | Not modelled as a distinct pension state. |
| UFPLS | Uncrystallised Funds Pension Lump Sum | Lump sum taken directly from uncrystallised pension funds, often described as 25% tax-free / 75% taxable. | Not modelled as UFPLS. |
| LSA | Lump Sum Allowance | Post-LTA allowance limiting tax-free lump-sum amounts in standard cases. | Not tracked. |
| LSDBA | Lump Sum and Death Benefit Allowance | Wider allowance relevant to some tax-free lump sums and death benefits. | Not tracked. |
| LTA | Lifetime Allowance | Old lifetime pension allowance regime abolished from 6 April 2024. | Not modelled; historical context only. |
| MPAA | Money Purchase Annual Allowance | Reduced contribution allowance that can be triggered by flexible pension access. | Not modelled. |
| PAYE | Pay As You Earn | Tax withholding system used by pension providers for taxable pension payments. | Not modelled. |
| BCE / RBCE | Benefit Crystallisation Event / Relevant Benefit Crystallisation Event | Technical event terminology used around pension benefit access and allowance checks. | Not modelled; terminology must be verified. |
| PA | Personal Allowance | Amount of income taxable at 0% before income tax starts, subject to rules/taper. | Depends on active tax pack; verify before examples. |
| SPA | State Pension Age | Age at which UK State Pension can start. | Dates can be configured; automated SPA rules are not the focus of this doc. |

---

## Core pension pot terms

### Defined Contribution (DC)

A DC pension is a pension pot. Contributions and investment returns build up a fund, and retirement income depends on how much is in the pot and how it is accessed.

RIP models DC pots directly.

### Defined Benefit (DB)

A DB pension promises a pension income according to scheme rules, usually linked to salary and service.

RIP does not model DB scheme rules. A DB pension can be represented as a guaranteed income source if the annual/monthly pension amount is known.

### Pension pot

A pension pot is the accumulated fund available within a DC pension.

In RIP, a DC pot has fields such as:

- opening balance;
- growth rate;
- tax-free portion;
- asset allocation;
- drawdown source identity.

---

## Tax-free cash terms

### Tax-Free Cash (TFC)

An informal umbrella phrase for pension money that can be received without income tax.

Important caution:

- “TFC” is convenient shorthand, but legal/tax treatment depends on the access route and allowance rules.
- Do not assume all tax-free pension amounts are identical for modelling purposes.

RIP currently models TFC only as a per-withdrawal split.

### Pension Commencement Lump Sum (PCLS)

PCLS is the technical term usually associated with taking tax-free cash when pension benefits start / are crystallised.

Plain-English version:

- A person may be able to take part of their pension as a tax-free lump sum.
- The rest may remain invested for drawdown or be used for other pension benefits.

Why it matters:

- An upfront PCLS creates a large tax-free cash-flow event early in retirement.
- Later drawdown from the remaining fund may be taxable.

RIP status:

- RIP does not currently model PCLS as a separate event.
- The current pro-rata model should not be described as “upfront PCLS”.

### Gradual pro-rata tax-free cash

This is RIP's current simple model.

Plain-English version:

- Each DC pension withdrawal is split between tax-free and taxable parts.
- Example: a £20,000 withdrawal with a 25% tax-free portion becomes £5,000 tax-free and £15,000 taxable.

Why it matters:

- It is easy to explain.
- It can approximate some cash-flow patterns.
- It avoids tracking crystallised/uncrystallised pension state.

Limitation:

- It is not a full legal/administrative model of PCLS, UFPLS, or phased crystallisation.

### Already crystallised / no tax-free cash remaining

A pot may have already had its tax-free cash taken, or there may be no tax-free cash left to use.

Plain-English version:

- Future withdrawals from that pot may be fully taxable.

RIP status:

- This is a possible future mode.
- It is not currently implemented as a distinct mode in projection behaviour.

---

## Access-route terms

### Crystallisation

Crystallisation is the process of bringing pension benefits into payment or designating funds for drawdown, depending on the route used.

Plain-English version:

- It is the point where part of the pension stops being purely untouched pension savings and starts being used for retirement benefits.

Why it matters:

- It can create entitlement to tax-free cash.
- It may affect allowance checks.
- It creates state: some funds may be crystallised, while some remain uncrystallised.

RIP status:

- RIP does not currently track crystallised and uncrystallised balances.

### Uncrystallised funds

Pension funds that have not yet been used to provide benefits.

RIP status:

- Not tracked separately.

### Crystallised funds

Pension funds that have been designated to drawdown or used to provide benefits.

RIP status:

- Not tracked separately.

### Flexi-Access Drawdown (FAD)

A flexible drawdown arrangement where crystallised pension funds remain invested and taxable withdrawals can be taken.

Plain-English version:

- Take any available tax-free lump sum if chosen/permitted.
- Leave the rest invested.
- Draw taxable income when needed.

RIP status:

- RIP models DC withdrawals and taxation at a cash-flow level.
- It does not model FAD as a distinct administrative state.

### Phased crystallisation

Accessing a pension gradually by crystallising portions over time rather than all at once.

Plain-English version:

- Instead of taking all tax-free cash upfront, the person accesses slices of the pension in stages.

RIP status:

- The current gradual pro-rata model may resemble some annual cash-flow outcomes.
- It does not model the actual crystallisation decisions.

### UFPLS

UFPLS stands for Uncrystallised Funds Pension Lump Sum.

Plain-English version:

- A lump sum is paid directly from uncrystallised pension funds.
- It is commonly explained as partly tax-free and partly taxable.

Why it matters:

- It may trigger MPAA.
- It may create emergency-tax issues.
- It is administratively different from flexi-access drawdown.

RIP status:

- RIP does not model UFPLS as a distinct access route.
- Do not label the current pro-rata split as UFPLS unless this is explicitly implemented and validated.

---

## Allowance terms

### Lifetime Allowance (LTA)

The old lifetime pension allowance regime. It was abolished from 6 April 2024.

RIP status:

- RIP should not build new logic around the old LTA regime.
- It may appear in historical explanations or when discussing the transition to LSA/LSDBA.

### Lump Sum Allowance (LSA)

The post-LTA allowance relevant to tax-free pension lump sums in standard cases.

Plain-English version:

- There is a lifetime cap on how much tax-free lump-sum pension cash can be received under the standard allowance.

Important caution:

- Be precise: LSA is about tax-free lump-sum amounts, not ordinary taxable pension withdrawals.
- Prior usage and protected allowances may matter.

RIP status:

- Not tracked.
- Possible future feature: warning/check if modelled tax-free lump sums approach or exceed a user-entered allowance.

### Lump Sum and Death Benefit Allowance (LSDBA)

A wider post-LTA allowance relevant to certain lump sums and death benefits.

RIP status:

- Not tracked.
- Probably out of scope unless RIP expands into death-benefit / estate-style pension modelling.

### Protected allowance / pension protections

Some people may have protections that change their available tax-free cash or allowance position.

RIP status:

- Not modelled.
- If LSA tracking is ever added, user-entered allowance values may be safer than assuming only the standard allowance.

---

## Tax and contribution terms

### Taxable pension income

The part of a pension withdrawal that is subject to income tax.

RIP status:

- Modelled through the tax calculation path, subject to the active tax pack and known limitations.

### Personal Allowance (PA)

The amount of income that can be taxed at 0% before income tax starts, subject to jurisdiction and tax-year rules.

RIP status:

- Depends on the active tax pack and configuration.
- Do not assume every illustrative example's PA treatment is already implemented.

### Personal Allowance taper

For some UK taxpayers, the Personal Allowance reduces when income exceeds a threshold.

Why it matters:

- Pension withdrawals can push total income into a range with a high effective marginal tax rate.

RIP status:

- Verify the active tax pack before using taper examples as tests or adviser material.

### PAYE

PAYE is the tax withholding system used by employers and pension providers.

Why it matters:

- First pension withdrawals can be taxed using emergency assumptions.
- The tax deducted at source may differ from final annual tax liability.

RIP status:

- Not modelled. RIP works as an annual planning projection, not a PAYE cash-flow settlement simulator.

### Emergency tax

Temporary over- or under-taxing that can happen when a pension provider applies an emergency tax code to an initial withdrawal.

RIP status:

- Not modelled.
- Best treated as an explanatory warning if relevant.

### Money Purchase Annual Allowance (MPAA)

A reduced annual allowance for future money-purchase pension contributions that can be triggered by flexible pension access.

Plain-English version:

- Some ways of accessing pension money can restrict how much can later be paid into DC pensions with tax relief.

RIP status:

- Not modelled.
- Possible future feature: warning only, not a contribution-tax calculation.

---

## Event terminology

### Benefit Crystallisation Event (BCE)

Older/wider pension-tax event terminology historically used around Lifetime Allowance checks.

### Relevant Benefit Crystallisation Event (RBCE)

Post-LTA terminology relevant to allowance checks under the newer regime.

RIP caution:

- Do not rely on memory for BCE/RBCE definitions.
- Recheck HMRC guidance before implementing or writing adviser-facing material.
- RIP does not currently model these events explicitly.

---

## RIP modelling language: preferred wording

Use wording like:

- “The current model treats 25% of each DC pension withdrawal as tax-free and 75% as taxable, where that is the pot's selected assumption.”
- “This is a gradual pro-rata cash-flow approximation.”
- “The app does not currently model upfront tax-free lump sums, crystallised/uncrystallised sub-pots, or Lump Sum Allowance tracking.”
- “Please confirm whether this simplified assumption is acceptable for the current planning use case.”

Avoid wording like:

- “The app models PCLS.”
- “The app models UFPLS.”
- “The app tracks crystallisation.”
- “The app applies the Lump Sum Allowance.”
- “This is the correct tax treatment for Isle of Man pensions.”

---

## Suggested adviser question

A concise adviser-facing question could be:

> At present the planner uses a simple gradual pro-rata pension tax-free-cash assumption: for example, 25% of each DC pension withdrawal is treated as tax-free and 75% as taxable where that is the selected pot assumption. It does not yet model an upfront tax-free lump sum, crystallised/uncrystallised pot tracking, UFPLS, or Lump Sum Allowance usage. Is this a reasonable first approximation for planning discussions, and if not, which tax-free-cash treatment would be most important to add first?

---

## Source-check reminder

Before implementing or publishing adviser-facing wording, recheck:

- HMRC Pensions Tax Manual for PCLS, UFPLS, LSA, LSDBA, RBCEs, and MPAA;
- GOV.UK private pension and annual allowance guidance;
- current tax-year rates and allowances;
- Isle of Man-specific tax/pension treatment where relevant;
- adviser feedback on acceptable modelling scope.
