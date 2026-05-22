# Adviser Demo Lite

Status: short live-demo script for the `demo` branch.

Purpose: show a fairly complete working prototype without asking the adviser to work through a large pack of examples. The review is about the planning model, assumptions, caveats, and priority of missing features. It is not a request to approve the app as regulated advice software.

Demo URL, once Netlify has built the branch:

`https://demo--retirement-income-planner.netlify.app/`

## Suggested framing

Use this wording at the start:

> This is a working retirement-income planning prototype. The automated tests give engineering assurance that the app applies its documented model consistently, but I need adviser judgement on whether the model, caveats, and priorities are appropriate for planning use.

Avoid saying:

- the app proves the numbers are correct;
- the app gives regulated advice;
- the pension-access model covers every provider workflow.

## Keep the demo to three examples

The aim is a short walkthrough, not a full technical review. Updated adviser-video synthesis suggests the two main drawdown engines are UFPLS and Phased FAD. The current demo is strongest on Phased FAD; use that honestly, and ask whether UFPLS should be the next first-class path.

### Example 1: Baseline plan

Question being demonstrated:

> Given the configured pots, income sources, target income, growth assumptions, and tax settings, what does the current plan project?

Show:

1. Dashboard summary.
2. Personal details / retirement date.
3. Income sources.
4. DC pension and ISA / tax-free account assumptions.
5. Asset allocation and growth-rate assumptions.
6. Income breakdown chart.
7. Year Table.
8. One expanded year with workings.

Adviser questions:

- Are the baseline assumptions framed clearly enough for a planning conversation?
- Are the visible caveats strong enough?
- Which assumptions would you expect to validate or override before relying on the projection?

Known caveats to state:

- Projections are deterministic and assumption-driven.
- Asset allocation mappings are broad planning approximations, not provider fund-specific validation.
- Tests show internal consistency against the documented model; they do not prove advice suitability.

### Example 2: Retirement income strategy / staged drawdown

Question being demonstrated:

> How does changing the source-allocation strategy affect income, tax, and remaining capital?

Show:

1. Strategy page.
2. Current staged drawdown setup.
3. A simple source-order or blended-stage comparison.
4. The effect on Dashboard / Year Table outputs.
5. Workings showing source allocation, tax, net income, and any depletion / transition behaviour.

Adviser questions:

- Is staged source sequencing plus simple blending a useful first model of adviser practice?
- Are there common source-allocation patterns that should be prioritised before more complex tax-aware optimisation?
- Is the distinction clear between target-led strategies and portfolio-driven strategies such as ARVA or fixed-percentage drawdown?

Known caveats to state:

- The app supports explainable source rules; it is not yet a black-box tax optimiser.
- The model should be reviewed for practical adviser workflows before adding more complex optimisation.

### Example 3: Pension access: PCLS plus taxable flexi-access drawdown

Question being demonstrated:

> Can the app represent phased crystallisation: take tax-free cash as capital, then draw taxable income from crystallised funds?

Show:

1. Strategy pension-access event area.
2. A PCLS / crystallisation event for a selected pension pot.
3. Year Table / workings showing that PCLS reduces pension capital but does not increase ordinary income, taxable income, or tax.
4. Taxable flexi-access drawdown from crystallised funds.
5. Ledger-aware ordinary FAD opt-in if relevant.
6. Warning behaviour when crystallised drawdown is insufficient.

Adviser questions:

- Is phased crystallisation plus taxable FAD the right primary workflow to prioritise before UFPLS?
- Should ordinary FAD stop and warn when crystallised funds run out, or should the app later offer an explicit auto-crystallisation planning workflow?
- Are MPAA, LSA / LSDBA, provider-rule, and jurisdiction caveats visible enough?
- Is it acceptable that released PCLS is currently modelled as outside-plan capital / pot reduction, not as a fully modelled destination account transfer?

Known caveats to state:

- LSA / LSDBA are caveated; the app does not yet enforce the full allowance regime numerically.
- Provider-specific pension access rules are not modelled.
- UFPLS is recognised as one of the two main drawdown engines, but it is not yet as complete in the UI as the Phased FAD path.

## Five questions to take away

1. Which assumptions are acceptable for planning if clearly caveated?
2. Which caveats need stronger wording before use with real cases?
3. Do you agree the app should present UFPLS and Phased FAD as the two main drawdown engines, with full crystallisation only as a warning/comparison?
4. What is the smallest extra pension/provider rule that would materially improve adviser confidence?
5. What output would make the app most useful in a real adviser-client review: clearer workings, better case notes, more exportable reports, or different scenarios?

## Suggested close

> I am not asking you to sign off the software. I am trying to find out whether the model is pointing in the right direction, which caveats must be made prominent, and which missing rules should be prioritised before wider use.
