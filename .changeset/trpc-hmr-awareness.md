---
'@robojs/trpc': patch
---

fix(trpc): make plugin HMR-aware so editing src/trpc/ files hot-reloads the tRPC router

- Add route definition (`src/robo/routes/trpc.ts`) declaring `src/trpc/` as a handler directory
- Add HMR hook (`src/robo/hmr.ts`) for post-reload logging and portal route loading
- Call `portal.ensureRoute('trpc', 'trpc')` in start hook so the portal has handler records for HMR reloads
