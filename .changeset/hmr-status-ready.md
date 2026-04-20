---
'robo.js': patch
---

fix(dev): reset terminal status to ready after successful HMR reload

Previously the interactive CLI status stayed stuck at "[building]" after HMR because no `status-progress` events fire from the spirit (start hooks don't re-run during HMR). Now the dev command sets status to "ready" directly after any successful HMR cycle.
