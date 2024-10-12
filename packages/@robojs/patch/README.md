<p align="center">✨ <strong>Generated with <a href="https://roboplay.dev/create-robo">create-robo</a> magic!</strong> ✨</p>

---

# @robojs/patch

Tired of platform-specific bugs? Was your project working fine until recently? **[@robojs/patch](https://robojs.dev/plugins/patch)** is here to save the day! 🎩✨

This package contains a collection of lightweight patches for common issues. We intend on maintaining them for as long as needed.

<div align="center">
	[![GitHub
	license](https://img.shields.io/github/license/Wave-Play/robo)](https://github.com/Wave-Play/robo/blob/main/LICENSE)
	[![npm](https://img.shields.io/npm/v/@robojs/patch)](https://www.npmjs.com/package/@robojs/patch) [![install
	size](https://packagephobia.com/badge?p=@robojs/patch@latest)](https://packagephobia.com/result?p=@robojs/patch@latest)
	[![Discord](https://img.shields.io/discord/1087134933908193330?color=7289da)](https://roboplay.dev/discord) [![All
	Contributors](https://img.shields.io/github/all-contributors/Wave-Play/robo.js?color=cf7cfc)](#contributors)
</div>

**Not using [Robo.js](https://robojs.dev) yet?** That's okay! Most patches work with any **JavaScript** project.

➞ [📚 **Documentation:** Getting started](https://docs.roboplay.dev/docs/getting-started)

➞ [🚀 **Community:** Join our Discord server](https://roboplay.dev/discord)

## Installation 💻

To add this plugin to your **Robo.js** project:

```bash
npx robo add @robojs/patch
```

Or install it as a normal package if you're not using **Robo.js**:

```bash
npm install @robojs/patch
```

## Patches 🩹

### Discord Entry Point Command

If your **[Discord Activity](https://robojs.dev/discord-activities/getting-started)** is old or you're using the same **Discord App** for bots and activities, you may encounter issues with the entry point command missing as well as your activity's launch button.

This patch fixes those issues by adding the missing command to your **Discord App** when it goes missing. Automatically. Just by having this patch installed. 🎩✨

Please be sure to have both `DISCORD_CLIENT_ID` and `DISCORD_TOKEN` environment variables set in your `.env` file.

### Discord Proxy

When running a **[Discord Activity](https://robojs.dev/discord-activities/getting-started)** through Discord, you may encounter **[Content Security Policy (CSP)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)** issues. This patch fixes those issues, including **[Hot Module Replacement (HMR)](https://www.sanity.io/glossary/hot-module-replacement)**, by making sure internal requests follow **[Discord Proxy](https://robojs.dev/discord-activities/proxy)** rules.

We have different ways to apply this patch depending on your project setup.

#### Method 1: Vite Plugin (Recommended)

If you're using **Vite**, you can apply the patch as a plugin in your **Vite** config file.

```ts
import { DiscordProxy } from '@robojs/patch'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [DiscordProxy.Vite()]
})
```

> [!TIP]
> You can find this file as `/config/vite.mjs` if you're using a **[Robo Template](https://robojs.dev/templates/overview)** or `vite.config.js` if you're using something else.

We recommend this method because it allows the patch to run before before **Vite**'s HMR client, ensuring that it works correctly.

#### Method 2: Function Call

If you're not using **Vite**, you can apply the patch by calling a function directly.

```ts
import { DiscordProxy } from '@robojs/patch'

DiscordProxy.patch()
```

Be sure to call this at the very beginning of your project, before other scripts are loaded. (e.g. the top of your `index.js` file)

#### How it works

This patch works by updating the **[`fetch`](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)** and **[`WebSocket`](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)** globals.

Each time a request is made, it makes sure that `/.proxy` is always included at the beginning of the URL's path. This comforms to the **CSP** policy set by the **Discord Proxy**.

This patch is extremely lightweight and only runs when needed. Nothing is patched when running outside of **Discord**.

#### External Requests

This does not affect requests made to external URLs. If you're having **CSP** issues with those, you may be able to fix them by creating your own **Proxy** or mapping them in the **Discord Developer Portal**.

➞ [📚 **Tutorial:** Resolve CSP Issues with a Proxy](https://dev.to/waveplay/resolve-content-security-policy-csp-issues-in-your-discord-activity-using-a-nodejs-proxy-2634)


## Building Discord Apps?

Join our **Discord Server** to chat with other developers, ask questions, and share your projects. We're a friendly bunch and always happy to help! Plus, our very own AI Robo, Sage, is there to assist you with any questions you may have.

➞ [🚀 **Community:** Join our Discord server](https://roboplay.dev/discord)
