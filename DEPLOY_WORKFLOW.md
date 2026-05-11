# Deploy Workflow

## Live Site

- Netlify URL: https://retirement-income-planner.netlify.app
- Netlify admin: https://app.netlify.com/projects/retirement-income-planner
- GitHub repo: https://github.com/zartyblartfast/RetirementIncomePlannerV3

## How Deployment Works

Netlify should be connected to the GitHub repo and configured to deploy from the
`main` branch. A push to `main` should trigger a Netlify build automatically.

Netlify uses [netlify.toml](netlify.toml):

- Build command: `npm run build`
- Publish directory: `dist`
- SPA routing: all routes redirect to `index.html`

Later, the Netlify site can be pointed at a custom domain from the Netlify domain
settings.

## Before Pushing

Run these checks locally:

```bash
npm install
npm run test -- --run
npm run build
npm run preview
```

Then open the local preview URL and smoke-test:

- Dashboard loads
- What If loads
- Review loads
- Config import/export still works
- A browser refresh on a nested route still loads the app

Note: `npm run lint` is intended to be part of this checklist, but it currently
needs an ESLint 9 flat config before it will run successfully.

## Deploy

```bash
git status
git add -A
git commit -m "Describe the change"
git push origin main
```

After pushing, check the Netlify deploy log in the admin page. When the build
finishes, open the Netlify URL and repeat the smoke test.

## Rollback

If a deploy is bad, use the Netlify admin deploy history to roll back to the
previous successful deploy. Then fix the issue locally and push a new commit.

## Important Notes

- All user data is stored in the browser's `localStorage`; Netlify does not store
  user plan data.
- The app is a PWA, so browser caching/offline behavior can affect what users see
  immediately after a deploy.
- Keep feature work on a development branch, then merge to `main` when ready to
  deploy.
