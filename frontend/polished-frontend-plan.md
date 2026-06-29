# Polished Frontend Plan

## Summary
- Keep the current user-facing shape: home landing flow, dashboard, and agent assistant.
- Keep the internal lab in-repo but gated by default so it is not exposed publicly.
- Use a lightweight guest identity for now, with optional account expansion later.
- Comment out dead legacy files instead of deleting them so later review is easy.
- Polish for production by improving structure, state shape, loading states, error handling, and theme/style consistency.

## Current State
- `src/App.js` is the active app shell.
- `src/AppDesign.js` is an older app variant that is no longer referenced.
- `src/styles/App.css`, `src/styles/tripOptimizer.css`, and `src/styles/landing.css` are legacy style holders.
- The main pages are landing, dashboard, agent, and internal lab.
- Dashboard and agent pages can still be refined for component clarity, state consistency, and production UX states.
- Internal tools should stay out of default user-facing flows.

## What To Change
- Comment out `src/AppDesign.js` in place for later review.
- Comment out `src/styles/App.css`, `src/styles/tripOptimizer.css`, and `src/styles/landing.css` in place for later review.
- Add a stable guest identity hook so user context survives reloads without requiring login.
- Keep current routes but streamline the app shell so page logic is cleaner.
- Leave the internal lab in the project, but make sure it appears only when an internal gate is active.
- Refactor dashboard/agent flows toward clearer state contracts and more consistent loading/error/empty states.
- Keep polished UI styling while consolidating style ownership into `designSystem.css` plus cinematic overrides.

## Acceptance Checks
- Landing plan flow still works.
- Dashboard boarding, tab loading, and tab refresh still behave correctly.
- Agent page still opens and interacts correctly.
- Internal lab stays hidden unless explicitly enabled.
- Guest identity is stable across reloads.
- Legacy commented files remain reviewable and should not be active in the build.
