# Ledger-Aware Ordinary Pension Withdrawals Implementation Plan

> **For Hermes:** Use subagent-driven-development skill only if implementation becomes broad. For the first code slice, Hermes can implement directly with TDD because the touched surface is narrow but tax-sensitive.

**Goal:** Add an explicit opt-in mode where ordinary staged DC withdrawals consume existing crystallised flexi-access drawdown balance as 100% taxable pension income, instead of using the default simplified pro-rata TFC approximation.

**Architecture:** Keep the default/migration path unchanged. Add a per-DC-pot pension-access mode for ledger-aware ordinary FAD withdrawals. Ordinary staged withdrawals then branch on that pot-level mode: simplified pots keep the existing `tax_free_portion` split; ledger-aware pots draw only from `crystallised_drawdown_balance`, treat all gross as taxable, update MPAA/taxable-drawdown ledger state, and cap when crystallised balance is insufficient. Do not auto-crystallise and do not silently fall back to simplified pro-rata.

**Tech Stack:** TypeScript, React config model, projection engine, Vitest.

---

## Research-checked decisions

DeepSeek/keepseek review confirmed the conservative design:

1. Insufficient crystallised balance should cap/shortfall/warn and move to the next source. Users must create crystallised balance through explicit PCLS/crystallisation events.
2. No automatic crystallisation. That would create hidden PCLS/LSA usage and change the planning route without user intent.
3. No silent fallback to simplified pro-rata. That would mix legal/tax treatments inside one pot without a clear boundary.
4. Opt-in should be per DC pot, not per staged source. One pot has one crystallised/uncrystallised ledger, so per-source switches would be incoherent.
5. NET-mode gross-up must use `tax_free_portion = 0` for ledger-aware FAD.
6. GROSS-mode should withdraw requested gross up to available crystallised balance, all taxable.
7. Cleardown sweeps must respect the same mode; a sub-£50 ledger-aware crystallised residual is also 100% taxable.

## Product stance

This is not a replacement for the existing model. It is an explicit advanced mode for pots where the user/adviser has planned crystallisation/PCLS events and wants regular staged withdrawals to come from crystallised drawdown.

Suggested UI label:

> Ledger-aware flexi-access drawdown

Suggested caveat:

> Ordinary withdrawals from this pension pot are taken only from crystallised drawdown funds and are treated as 100% taxable pension income. Create explicit PCLS/crystallisation events first to make crystallised drawdown available. The model will not automatically crystallise more funds or fall back to simplified pro-rata withdrawals.

## Config shape

Extend `DCPotPensionAccessConfig` with a third explicit category:

```ts
export type DCPotPensionAccessConfig =
  | {
      category: 'compatibility_approximation';
      approximation: PensionAccessCompatibilityApproximation;
    }
  | {
      category: 'explicit_access_route';
      event_type: PensionAccessExplicitRoute;
      timing_pattern?: PensionAccessTimingPattern;
      cadence?: PensionAccessCadence;
    }
  | {
      category: 'explicit_ledger_aware';
      route: 'taxable_flexi_access_drawdown';
      timing_pattern?: PensionAccessTimingPattern;
      cadence?: PensionAccessCadence;
    };
```

Rationale:

- Existing configs keep default `compatibility_approximation / simplified_pro_rata`.
- Per-pot mode is coherent with the pot-level ledger.
- The explicit category prevents accidental support for UFPLS or PCLS ordinary withdrawals before those are specified.

## Engine behaviour

For a DC pot whose `pension_access.category === 'explicit_ledger_aware'` and `route === 'taxable_flexi_access_drawdown'`:

- ordinary staged withdrawal available balance = `ledger.crystallised_drawdown_balance`, not total `dcBalances[pot]`;
- gross withdrawal = min(requested gross, crystallised drawdown balance, total pot balance);
- reduce total `dcBalances[pot]` by gross withdrawal;
- reduce `ledger.crystallised_drawdown_balance` by gross withdrawal;
- increment `ledger.taxable_drawdown_taken` by gross withdrawal;
- trigger MPAA on first taxable drawdown and set trigger date/month metadata consistently with explicit FAD events;
- add `dc_gross += gross`;
- add `dc_tf += 0`;
- taxable amount = gross;
- `withdrawal_detail[pot]` and monthly net income reflect after-tax net, as now;
- `drawdown_stage_allocations` record `tax_free_amount: 0`, `taxable_amount: gross`;
- when crystallised balance is insufficient, emit warning/caveat and let staged allocation continue to the next source.

## Warning/caveat codes

Add a new code distinct from explicit FAD event insufficiency:

```ts
'crystallised_balance_insufficient_for_ordinary_drawdown'
```

Use it when an ordinary ledger-aware withdrawal request cannot be fully met from crystallised drawdown balance.

Display wording:

> Crystallised drawdown balance was insufficient for the requested ordinary withdrawal; no automatic crystallisation or pro-rata fallback was applied.

## Task 1: Add type/validation support only

Status: implemented in Dev03 checkpoint `298436b feat: add ledger-aware pension access mode`.

**Objective:** Add the pot-level config shape without changing projection outputs.

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/engine/pensionAccessModes.ts`
- Test: `src/engine/__tests__/pensionAccessModes.test.ts`

**Step 1: Write failing tests**

Add tests that:

- default normalized DC pots remain `compatibility_approximation / simplified_pro_rata`;
- `explicit_ledger_aware / taxable_flexi_access_drawdown` is accepted by validation;
- unsupported explicit ledger routes are rejected/normalized back safely if malformed input is encountered;
- existing unsupported `explicit_access_route` behaviour remains unchanged unless intentionally changed.

**Step 2: Run focused tests**

Run:

```bash
npx vitest run --config vitest.config.ts src/engine/__tests__/pensionAccessModes.test.ts
```

Expected: new tests fail before implementation, then pass after minimal changes.

**Step 3: Implement minimal type/validation code**

Add the union variant and validation branch. Do not alter projection logic yet.

**Step 4: Verify no output change**

Run:

```bash
npx vitest run --config vitest.config.ts src/engine/__tests__/pensionAccessModes.test.ts src/engine/__tests__/projection.test.ts src/engine/__tests__/golden.test.ts
npx tsc -b
```

Revert generated `tsconfig.*.tsbuildinfo` before commit.

**Step 5: Commit**

```bash
git add src/engine/types.ts src/engine/pensionAccessModes.ts src/engine/__tests__/pensionAccessModes.test.ts
git commit -m "feat: add ledger-aware pension access mode"
```

## Task 2: Add projection helper for ledger-aware ordinary FAD withdrawals

Status: implemented in Dev03 checkpoint `9785287 feat: apply ledger-aware ordinary FAD withdrawals`.

**Objective:** Implement a small helper path for ordinary withdrawals that draw from crystallised balance and are 100% taxable.

**Files:**
- Modify: `src/engine/projection.ts`
- Modify: `src/engine/types.ts` if warning type is shared there
- Test: `src/engine/__tests__/projectionPensionLedger.test.ts`

**Step 1: Write failing tests**

Add tests for:

- PCLS event creates crystallised balance; ordinary ledger-aware withdrawal then consumes it as 100% taxable;
- `dc_tax_free_portion` is zero for ledger-aware ordinary withdrawals;
- MPAA triggers on the first ordinary ledger-aware FAD withdrawal, not on PCLS-only;
- `uncrystallised_balance + crystallised_drawdown_balance` reconciles to remaining pot;
- simplified pro-rata outputs remain unchanged for non-opted-in pots.

**Step 2: Run focused tests**

```bash
npx vitest run --config vitest.config.ts src/engine/__tests__/projectionPensionLedger.test.ts
```

Expected: new tests fail.

**Step 3: Implement helper**

Add a local helper such as:

```ts
function applyOrdinaryFadWithdrawalToLedger(
  potRef: string,
  requestedGross: number,
  triggerDate: string,
): { actualGross: number; warning?: string } {
  // cap to crystallised_drawdown_balance
  // decrement crystallised_drawdown_balance and dcBalances[potRef]
  // increment taxable_drawdown_taken
  // trigger MPAA if not already triggered
}
```

Keep it narrow. Do not reuse `updatePensionLedger()` for this because that helper currently mirrors simplified pro-rata movements.

**Step 4: Wire GROSS mode**

In `withdrawGrossDc()`:

- if pot is ledger-aware, cap to crystallised drawdown balance;
- call net/tax calculation with `taxFreePortion = 0`;
- record stage allocation with tax-free zero and taxable gross;
- emit insufficient-balance warning when requested gross was capped.

**Step 5: Wire NET mode**

In `withdrawDc()`:

- use `grossUp(netNeeded * 12, monthlyTaxableBaseAnnual, 0, taxCfg) / 12`;
- cap actual gross to crystallised drawdown balance;
- calculate net with `netFromDcWithdrawal(gross, 0)`;
- return actual net, so allocation can continue if capped.

**Step 6: Verify**

Run:

```bash
npx vitest run --config vitest.config.ts src/engine/__tests__/projectionPensionLedger.test.ts src/engine/__tests__/pensionAccessEvents.test.ts src/engine/__tests__/taxEvents.test.ts
```

## Task 3: Handle insufficiency, mixed mode, and cleardown

**Objective:** Make edge cases explicit and visible.

**Files:**
- Modify: `src/engine/projection.ts`
- Modify: `src/engine/workings.ts`
- Modify: `src/components/dashboard/YearTable.tsx`
- Test: `src/engine/__tests__/projectionPensionLedger.test.ts`
- Test: `src/engine/__tests__/workings.test.ts`
- Test: `src/components/dashboard/__tests__/YearTable.test.tsx`

**Step 1: Write failing tests**

Cover:

- insufficient crystallised balance caps the withdrawal and produces warning/caveat;
- no auto-crystallisation occurs;
- no simplified pro-rata fallback occurs;
- source allocation moves to the next source when available;
- sub-£50 cleardown of ledger-aware crystallised residual is 100% taxable;
- explicit FAD event plus ordinary ledger-aware withdrawal depletes the same crystallised pool and should not produce the old compatibility mixed-mode warning.

**Step 2: Implement warning/caveat display**

Map the new warning code in workings and Year Table copy.

**Step 3: Adjust mixed-mode warning logic**

The existing warning should apply when a pot has explicit events and ordinary withdrawals remain simplified pro-rata. If the pot is explicitly ledger-aware, the warning should either disappear or be replaced by more precise same-ledger-pool copy.

**Step 4: Verify focused tests**

```bash
npx vitest run --config vitest.config.ts src/engine/__tests__/projectionPensionLedger.test.ts src/engine/__tests__/workings.test.ts src/components/dashboard/__tests__/YearTable.test.tsx
```

## Task 4: Add guarded UI affordance

Status: implemented in Dev03 checkpoint `pending`.

**Objective:** Expose the opt-in clearly without making it the default.

**Files:**
- Modify: `src/components/strategy/PensionAccessEventsPanel.tsx` or the DC pot settings surface if more appropriate
- Test: matching component test

**Step 1: Decide UI placement before coding**

Preferred first UI: pot-level pension-access mode selector near the pension pot settings, not inside each staged drawdown source.

Options:

- `Simplified pro-rata pension withdrawals` default.
- `Ledger-aware flexi-access drawdown` advanced/guarded option.

**Step 2: Add tests**

Assert the copy says:

- ordinary withdrawals are taken only from crystallised drawdown;
- all ordinary withdrawals in this mode are taxable pension income;
- explicit PCLS/crystallisation events are needed first;
- no auto-crystallisation or pro-rata fallback.

**Step 3: Implement UI**

Keep it advanced/guarded. Do not expose UFPLS here.

## Task 5: Full verification and checkpoint

Run:

```bash
npx vitest run --config vitest.config.ts
npx tsc -b
npm run build
```

Then:

```bash
git checkout -- tsconfig.app.tsbuildinfo tsconfig.node.tsbuildinfo
git diff --check
git status --short --branch
```

Commit and push only after the intended files are staged.

## Non-goals for this slice

- No automatic crystallisation.
- No UFPLS ordinary withdrawal mode.
- No LSA/LSDBA numeric enforcement beyond existing caveats.
- No separate crystallised drawdown growth rate.
- No per-stage-source pension-access mode.
- No adviser-facing claim that this covers every provider workflow.

## Open adviser/user question before UI exposure

Before making this prominent in UI, ask:

> For a pot using ledger-aware flexi-access drawdown, should ordinary income withdrawals stop when the crystallised drawdown balance is exhausted and require explicit future crystallisation events, or should the planner offer a separate annual auto-crystallisation planning workflow? The recommended first implementation is stop/warn, not auto-crystallise.
