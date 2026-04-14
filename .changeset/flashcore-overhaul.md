---
'robo.js': minor
---

feat(flashcore): simplified architecture with lazy migration from legacy storage

Complete Flashcore rewrite: removed adapter wrapper stack (cache, compression, encryption, resilience), migration system, integrity/repair system, transaction system, and WAL recovery. Replaced with a simpler direct adapter model and RuntimeMigrationAdapter that lazily migrates data from legacy `.robo/data` to `.robo/flashcore`. Added fsync for durability and structured DataCorruptionError handling. Advanced features extracted to @robojs/flashcore-extras package.
