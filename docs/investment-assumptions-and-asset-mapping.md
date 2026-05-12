# Investment Assumptions And Asset Mapping

Status: draft for adviser/user review.

This note explains how the app maps real DC pension pots and ISA/tax-free accounts to broad planning asset allocations for growth suggestions, historical backtests, and stress-style analysis.

The app does not know the user's real provider holdings unless the user or adviser enters an allocation. The mapping is therefore a planning assumption, not a fund-specific recommendation or validation.

## User-facing principle

Each DC pot and ISA/tax-free account has an editable asset allocation mapping.

Default mapping:

- Diversified Growth / Multi-Asset

This default is intended as a neutral starting point for users who have not yet checked the underlying fund factsheet. It should not be presented as the app knowing the correct fund mapping.

Recommended wording:

> Select the closest broad asset allocation for this pot/account. If unsure, use Diversified Growth as a neutral default. For better accuracy, check the provider's fund factsheet or ask an adviser to map the fund to the nearest planning asset mix.

## Why this is approximate

Provider funds rarely map perfectly to the app's internal planning classes. A pension or ISA may be labelled as one of the following:

- Balanced Managed Fund
- Lifestyle or Target Retirement Fund
- Multi-Asset 60
- Cautious Portfolio
- Global Equity Tracker
- Corporate Bond Fund
- Cash Fund
- With-Profits Fund

Some of these are straightforward; others need judgement. Lifestyle and target-retirement funds are especially time-sensitive because the allocation may change automatically as retirement approaches.

The app should therefore avoid saying:

> This fund equals this allocation.

Prefer:

> Suggested broad mapping only. Check the fund factsheet or adviser judgement.

## Internal planning asset classes

The current six planning buckets are defined in `src/engine/data/asset_model.json`:

| Planning class | Typical real-world labels |
| --- | --- |
| Global Equity | Global equity, world equity, international equity, global index tracker |
| Diversified Growth / Multi-Asset | Diversified growth, multi-asset, balanced, default fund, growth fund |
| Investment-Grade Bonds / Gilts | Global bonds, UK gilts, corporate bonds, pre-retirement bond funds |
| Inflation-Linked Bonds | Index-linked gilts, inflation-linked bonds, linkers |
| Cash / Money Market | Cash, money market, short-term deposit |
| Property / REITs | Property, real estate, REITs |

## Portfolio templates

The app exposes broad templates so users/advisers do not have to enter detailed weights in every case. Current templates include:

- 100% Global Equity
- Balanced 80/20
- Balanced 60/40
- Moderate Multi-Asset
- Cautious 40/60
- Defensive 20/80
- Diversified Growth default
- Pre-Retirement Cautious
- Custom mix

The template selected for a pot/account is used by deterministic growth assumptions and historical/stress analysis. When a user changes the asset allocation, the app auto-fills the pot/account growth rate from the allocation's mid historical real-return suggestion. The growth field remains editable for an explicit user/adviser override.

## Updating mappings later

Mappings must remain editable after onboarding or initial setup.

Reasons a mapping may change:

- the user switches funds;
- an adviser rebalances the portfolio;
- a lifestyle fund de-risks over time;
- cash is deliberately built up before drawdown;
- an ISA moves from growth assets to income/capital-preservation assets;
- the provider changes a fund's strategic allocation.

Current simple behaviour:

- editing the allocation updates the current planning assumption for future projections;
- exported full-case files include the current allocation mapping as part of the plan;
- historical review entries do not yet preserve a full allocation-change ledger.

Future review/case-ledger behaviour could record:

- previous allocation;
- new allocation;
- effective review date;
- note, e.g. "Switched from Balanced Fund to Cautious Fund after adviser review."

## Historical proxy caveat

The app's historical returns are broad proxy series, not provider fund histories.

Examples:

- Global Equity uses a blend of US equity and UK equity total-return series.
- Diversified Growth is synthetic: currently a 60% global-equity / 40% gilts-style proxy.
- Property is synthetic because direct property/REIT historical data is not currently included.
- Inflation-linked bonds use a crude derived approximation.
- Cash uses Bank Rate as a proxy.

Adviser-facing wording:

> The app maps pots/ISAs to broad planning asset classes and historical proxy series. It does not perform fund-specific backtesting. Please review whether the selected mappings and proxy assumptions are reasonable for the client case.

## Adviser review questions

1. Are the selected asset allocation mappings reasonable approximations of the actual DC/ISA holdings?
2. Are the available templates sufficient for common client cases?
3. Should any additional templates be added for the intended adviser workflow?
4. Is the Diversified Growth default acceptable as a neutral placeholder when holdings are unknown?
5. Is the caveat wording strong enough for users who may not understand fund allocation drift?
6. For lifestyle/target-retirement funds, should the app ask for the current factsheet allocation rather than the fund name?
7. Are the historical proxy limitations acceptable for illustrative planning, or should some outputs be hidden until adviser-reviewed mappings are available?
