# Pinned RPC Manifests

This directory contains checked-in RPC manifests extracted from specific versions of `@discord/embedded-app-sdk`.

## Purpose

- **Fallback**: When the consumer project doesn't have `@discord/embedded-app-sdk` installed, the pinned manifest is used as a fallback.
- **Testing**: Snapshot tests verify that the manifest structure and content remain stable for pinned SDK versions.
- **Baseline**: Provides a known-good reference for the RPC command/event surface area.

## Files

- `manifest-{version}.json` - Manifest for a specific SDK version
- `latest.json` - Copy of the most recent pinned manifest (used at runtime)

## Regenerating

To regenerate the pinned manifest for a new SDK version:

```bash
# From packages/@robojs/mock/
npx tsx src/activity/schema/generate-pinned.ts
```

This script:
1. Resolves the installed `@discord/embedded-app-sdk` package
2. Runs the extraction pipeline against it
3. Writes the manifest to `manifest-{version}.json`
4. Updates `latest.json`

## When to Update

Update the pinned manifest when:
- Discord releases a new version of `@discord/embedded-app-sdk` with new commands/events
- Schema completeness tests fail due to SDK changes
- You need to test against a specific SDK version
