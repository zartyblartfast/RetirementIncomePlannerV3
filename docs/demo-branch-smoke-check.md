# Demo Branch Smoke Check

Status: demo baseline verification checkpoint.

Branch: `demo`
Latest commit checked: `6281cbc docs: capture UFPLS and phased FAD visual ideas`

## Automated verification

Command run locally on the `demo` branch:

```bash
npx vitest run --config vitest.config.ts && npx tsc -b && npm run build
```

Result:

- Vitest: 426/426 tests passed across 51 files.
- TypeScript build: passed.
- Production build: passed.
- Existing Vite chunk-size warning only.

## Netlify branch URL check

Expected branch URL tried:

```text
https://demo--retirement-income-planner.netlify.app/
```

Result observed:

- Netlify returned `Site not found`.
- The main site still loads at `https://retirement-income-planner.netlify.app/`.
- `npx netlify status` reports this environment is not logged in, so the build/deploy state could not be checked from the CLI.

Interpretation:

- The `demo` branch is pushed and synced in Git.
- The Netlify branch deploy may not yet be enabled, may not have built, or may use a different branch-deploy setup.
- This is a deployment/configuration check, not an app build failure.

## Local production-preview smoke check

Local preview command:

```bash
npm run preview -- --host 127.0.0.1 --port 4173
```

URL checked:

```text
http://127.0.0.1:4173/
```

Smoke-tested flows:

1. Onboarding / setup-from-scratch flow.
2. Dashboard load.
3. Strategy page load.
4. Add PCLS crystallisation event.
5. Dashboard warnings after PCLS event.
6. What If page load.
7. Review page load.

Console status:

- No JavaScript console errors observed during the smoke path.

Visual status:

- Dashboard rendered correctly.
- Navigation rendered correctly.
- Configuration, warnings, summary cards, charts, Year Table, and internal consistency panel were visible.
- PCLS event controls rendered after adding an event.
- What If and Review pages loaded.

## Notes / minor observations

- The wizard Finish button uses a browser confirmation dialog; in the headless browser click call this can time out, but the plan was created successfully after reloading the local preview URL. This matches the known headless-browser confirm-dialog pitfall rather than an app crash.
- On the Strategy page, the first normal browser click on `Add PCLS crystallisation` did not visibly update the page in the snapshot, but a direct DOM click triggered the event and the controls rendered. Automated tests for the panel are passing; this is worth rechecking manually in a normal browser before the adviser demo.
- The demo branch is suitable as a code/docs baseline. The remaining external dependency is Netlify branch-deploy availability.

## Suggested next actions

1. Check Netlify admin for whether branch deploys are enabled for `demo`.
2. If enabled, wait for the branch deploy to complete and repeat the same smoke path on the deployed URL.
3. If not enabled, either enable branch deploys for `demo` or use local/main preview for adviser walkthrough until the branch URL is available.
