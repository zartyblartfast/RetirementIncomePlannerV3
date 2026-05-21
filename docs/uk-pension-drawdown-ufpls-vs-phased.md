# UK pension drawdown: UFPLS vs phased drawdown

Compiled from a conversation reviewing claims made in a YouTube video by Dianne Sullivan, financial coach.

Sources are cited inline. This is a research note, not an implementation specification or regulated financial advice.

## Q1: Is the financial advisor's explanation of phased drawdown vs UFPLS correct?

Verdict: Broadly correct, well-framed, but one critical detail omitted from the transcript — the MPAA trigger difference.

The advisor's transcript claims:

- UFPLS and phased drawdown "look very similar on the surface" ✅
- They "behave differently" ✅
- There's a "key trade-off around tax-free cash and timing" ✅
- "Your pension staying uncrystallised for longer can matter" ✅
- "Small decisions can have a surprisingly big impact over time" ✅

## How the two methods work

### UFPLS: Uncrystallised Funds Pension Lump Sum

Source: HMRC Pensions Tax Manual PTM063300

Each UFPLS payment is a single lump sum from uncrystallised funds:

- 25% paid tax-free
- 75% taxed as pension income at your marginal rate
- The whole payment is one benefit crystallisation event
- Funds remain uncrystallised until each UFPLS is taken
- "The tax rules do not limit the number of UFPLS that can be taken" — they can be spread over time

### Phased drawdown / phased crystallisation

Sources: Hargreaves Lansdown, HMRC PTM063200 / PTM056520

Each "phase" involves two distinct steps:

1. Crystallise a slice: 25% comes out as a PCLS, Pension Commencement Lump Sum — entirely tax-free. The remaining 75% moves into a flexi-access drawdown pot and stays invested.
2. Take income, optionally later or never: any withdrawals from the crystallised drawdown pot are taxed as 100% pension income.

Hargreaves Lansdown:

> Phased drawdown lets you move your pension into drawdown in stages, rather than all at once. Each time you move a portion, you can take up to 25% of that as a tax-free lump sum. You choose how much taxable income to take from the rest and when.

## Why they look similar

Example: withdraw £10,000.

| Method | Tax-free amount | Taxable amount |
|---|---:|---:|
| UFPLS | £2,500 | £7,500 |
| Phased drawdown | Crystallise £10,000 → £2,500 PCLS | £7,500 taxable income |

Tax in year 1 can therefore appear identical.

On the surface, the same result is produced. This is what the advisor means by "they look very similar".

## The critical differences

### 1. Tax-free cash timing

With UFPLS, you must take the tax-free cash and taxable income together — they are one indivisible payment.

With phased drawdown, you can take the 25% PCLS and leave the 75% crystallised portion invested without taking any taxable income from it yet. You control when taxable income hits.

### 2. The MPAA trap ⚠️

Sources: HMRC PTM056520 and PTM056530

This is arguably the biggest practical distinction. The MPAA, Money Purchase Annual Allowance, reduces the annual money-purchase pension contribution allowance from £60,000 to £10,000.

- UFPLS triggers MPAA: the first UFPLS payment is explicitly a trigger event, PTM056520. After the first UFPLS, contributions to money purchase pensions are restricted by the MPAA.
- Phased drawdown does not trigger MPAA as long as only the 25% PCLS is taken and no income is taken from the crystallised drawdown pot. PCLS is explicitly listed as a payment that does not trigger the money purchase annual allowance, PTM056530.

HMRC PTM056530:

> The money purchase annual allowance will not apply if one of the following events occur: payment of a pension commencement lump sum (see PTM063200)...

### 3. Growth on uncrystallised vs crystallised funds

- Uncrystallised funds: all growth retains the 25% tax-free entitlement. £100 growth can mean £25 extra tax-free cash when eventually crystallised.
- Crystallised drawdown pot: all growth is 100% taxable when withdrawn. The 25% tax-free ship has sailed.

This is what the advisor means by "why your pension staying uncrystallised for longer can matter".

### 4. Death benefits

Source: HMRC PTM072400

Uncrystallised funds pass tax-free if death occurs before age 75; they are taxed at the beneficiary's marginal rate if death occurs after age 75.

Crystallised drawdown funds follow similar rules but are also potentially subject to IHT from April 2027.

## What's missing / could be stronger

1. The MPAA difference is the headline — surprising it is not in the transcript, as it is the single biggest practical distinction for anyone still working or making contributions.
2. Lump Sum Allowance, new from April 2024: both UFPLS and PCLS count against the £268,275 Lump Sum Allowance. Phased drawdown uses it up slice by slice.
3. Pension provider restrictions: not all providers offer phased drawdown. Practical availability matters.

## Q2: What is the typical crystallisation period for phased drawdown?

Answer: Annual crystallisation, 12 months, is the overwhelming standard. Six-month and three-month periods are rare and usually driven by specific circumstances.

Primary source: M&G / Prudential Adviser Technical Guide, "Phased Retirement", updated 5 April 2026.

## Source evidence

The M&G adviser-facing case study explicitly uses a "year on year stepped approach" — crystallising once at the start of each tax year. The article refers to UFPLS as being "taken annually as one off payments".

Their Strategy A, phased drawdown with PCLS, pattern each year:

1. Crystallise just enough to produce the PCLS needed to bridge the income gap.
2. Take taxable drawdown income from the crystallised pot to use up remaining personal allowance.
3. Leave the uncrystallised balance untouched until next year.

## Why annual dominates

### Tax year alignment

The UK tax year runs from 6 April to 5 April. Personal allowance, currently £12,570, and basic-rate band, currently £37,700, reset annually.

Crystallising annually lets you:

- plan taxable income precisely against your personal allowance;
- avoid crossing tax bands unnecessarily;
- coordinate with other income, such as State Pension, part-time work, or rental income.

### Provider fees

Each crystallisation event involves benefit crystallisation processing, PCLS calculation, fund designation, and paperwork. Many providers charge per event. Quarterly crystallisation can mean four times the fees.

### MPAA preservation

Taking only PCLS, without drawdown income, does not trigger MPAA. Annual crystallisation can keep the £60,000 contribution allowance intact as long as possible, provided taxable flexible income is not taken.

### Investment logic

Crystallising a full year in one go means more money stays in the uncrystallised pot longer, preserving the 25% tax-free status on future growth.

## When shorter periods might be used

### Monthly UFPLS, not phased drawdown

The M&G article notes that monthly UFPLS can work better than annual UFPLS because of emergency tax:

> Emergency tax is likely to be applied to each UFPLS (assuming that these are taken annually as one off payments)... However, if a provider can facilitate monthly UFPLS payments the taxable element of each monthly payment (1/12th of the annual amount) would not trigger tax if an emergency tax code was applied.

A £24,000 annual UFPLS may be emergency-taxed as if the person earns £288,000/year on a Month 1 basis. Monthly £2,000 UFPLS payments can produce a much more accurate result.

### No cash buffer

If a retiree has no savings outside the pension and needs regular monthly income, they might crystallise quarterly to avoid holding a large cash balance. But this is second-best. Most advisers recommend keeping an emergency fund outside the pension.

### Provider limitations

Some pension providers do not offer true phased drawdown, meaning PCLS plus flexi-access drawdown in stages. Monthly UFPLS can be the pragmatic workaround.

## Typical pattern in practice

```text
TAX YEAR START (6 April)
  │
  ├─ Crystallise 1 year's worth of income
  │    ├─ 25% PCLS → taken as tax-free cash lump sum
  │    └─ 75% → designated into flexi-access drawdown pot
  │
  ├─ Monthly: draw regular income from crystallised drawdown pot
  │
  └─ Optional mid-year: top-up crystallisation if needed
```

Crystallisation event = annual.

Income payments from the already-crystallised pot = monthly, quarterly, or ad hoc.

## Summary table

| Period | Typical? | Best for |
|---|---|---|
| 12 months, annual | Yes — the standard | Most retirees. Aligns with tax year, minimises fees, maximises uncrystallised growth. |
| 6 months | Rare | No cash buffer; provider fee structure that does not penalise multiple events. |
| 3 months | Very rare | Monthly UFPLS users managing emergency tax; very lumpy income needs. |
| Monthly, UFPLS only | Edge case | UFPLS users avoiding emergency tax over-withholding. |

## Q3: What does "crystallise just enough to produce the PCLS needed to bridge the income gap" mean?

This comes from the M&G case study. The example below walks through the numbers.

Scenario: Michael wants £16,000/year net income. He has:

- part-time job: £9,100 taxable;
- £100,000 DC pension pot;
- personal allowance: £12,570.

Shortfall: £16,000 - £9,100 = £6,900 needed from his pension.

## Step-by-step, year 1

### Step 1: Use taxable drawdown income to fill remaining personal allowance

Michael's job uses £9,100 of his £12,570 personal allowance.

Remaining personal allowance:

```text
£12,570 - £9,100 = £3,470
```

He takes £3,470 as taxable drawdown income — £0 tax because it is within the unused personal allowance.

### Step 2: Fill the remaining gap with PCLS

He has received £3,470 so far from the pension. He needs £6,900 total from the pension.

Remaining gap:

```text
£6,900 - £3,470 = £3,430
```

This is taken as PCLS, entirely tax-free.

### Step 3: Calculate how much must be crystallised to produce that PCLS

PCLS is 25% of the amount crystallised:

```text
£3,430 ÷ 25% = £13,720 crystallised
```

The remaining 75%, £10,290, goes into the flexi-access drawdown pot for future years.

## Year 1 result

| Source | Amount | Tax? |
|---|---:|---|
| Employment income | £9,100 | Within PA — £0 |
| Drawdown income | £3,470 | Remaining PA — £0 |
| PCLS | £3,430 | Tax-free |
| Total net income | £16,000 | £0 tax paid |

£10,290 sits in the crystallised drawdown pot for future use.

## The pipeline

```text
Total income needed              £16,000
  minus Employment               -£9,100
  minus Drawdown (to fill PA)    -£3,470
  = GAP                          £3,430  ← bridged by PCLS
```

The PCLS bridges whatever remains after maximising tax-free and low-tax allowances. It is the tax-free top-up that fills the final gap.

## Why "just enough" matters

The crystallisation amount, £13,720, is calculated backwards:

```text
PCLS needed ÷ 25% = crystallisation amount
```

Crystallise too little and there is not enough tax-free cash.

Crystallise too much and funds are unnecessarily locked into the crystallised drawdown pot, where future growth loses 25% tax-free status.

Each year, a fresh, precisely-sized slice can be crystallised. This is the essence of phased drawdown — no more, no less than needed for that year's income.

## Comparison: UFPLS would have cost more

Had Michael used UFPLS for the same £6,900 net need, the tax bill would have been about £401 in year 1. With phased drawdown, tax is £0.

## Q4: Can someone take the full £25,000 PCLS from a £100k pot — and is it affected by the personal allowance?

Answer: Yes, the full £25,000 PCLS is entirely tax-free, and the personal allowance is irrelevant to it.

Source: HMRC Pensions Tax Manual PTM063200

## The mechanism

If the full £100,000 pot is crystallised in one go:

| Item | Amount | Tax treatment |
|---|---:|---|
| PCLS, 25% | £25,000 | Tax-free. No income tax, no personal allowance required. |
| Crystallised drawdown pot, 75% | £75,000 | Stays invested. 100% taxable when withdrawn. |

PCLS and personal allowance live in different worlds:

- PCLS: a capital lump sum, exempt from income tax under Schedule 29 Finance Act 2004. Capped by the Lump Sum Allowance, £268,275, and Lump Sum and Death Benefit Allowance, £1,073,100. On a £100k pot, the individual is well below both.
- Personal Allowance, £12,570: applies to income — employment, pension income, drawdown withdrawals, UFPLS taxable portions, etc. The personal allowance does not apply to PCLS.

## Contrast with UFPLS

| Approach | Tax-free received | Taxable received | Tax paid |
|---|---:|---:|---:|
| Full crystallisation + PCLS + £12,570 drawdown | £25,000 PCLS + £12,570 within PA | £12,570 | £0 |
| UFPLS for same £37,570 withdrawn | £9,393, 25% UFPLS portion | £28,178, 75% UFPLS portion | about £3,122 |

The difference: £0 vs about £3,122 tax for the same gross cash accessed. PCLS delivers far more tax-free cash in one go because the 25% is not bound to a matching taxable portion.

## The trade-off

Taking the full £25,000 PCLS upfront means crystallising the entire pot. The £75,000 drawdown pot is now crystallised, so all future growth in it is 100% taxable on withdrawal. The uncrystallised flexibility has been consumed in one shot.

Full upfront PCLS maximises immediate tax-free cash. Phased drawdown preserves the 25% tax-free entitlement on future growth.

## Sources referenced

| Source | Detail |
|---|---|
| HMRC Pensions Tax Manual PTM063300 | UFPLS definition, taxation rules, 25% tax-free / 75% taxable, unlimited number of payments permitted. |
| HMRC Pensions Tax Manual PTM063200 | Pension Commencement Lump Sum, PCLS, rules, tax-free status, conditions. |
| HMRC PTM056520 | MPAA trigger events — UFPLS is explicitly a trigger event; first flexi-access drawdown income payment is a trigger. |
| HMRC PTM056530 | Payments that do not trigger MPAA — PCLS explicitly excluded. |
| HMRC PTM072400 | Death benefits: beneficiary's flexi-access drawdown rules. |
| Hargreaves Lansdown, hl.co.uk/pensions/income-drawdown | Phased drawdown definition: move pension into drawdown in stages; each time a portion is moved, up to 25% can be taken as tax-free lump sum. |
| M&G / Prudential Adviser, mandg.com/adviser/tech-matters, "Phased Retirement", updated 5 April 2026 | Detailed case study comparing Strategy A, PCLS + drawdown, vs Strategy B, UFPLS; annual crystallisation as standard; emergency tax considerations; year-on-year stepped approach. |
