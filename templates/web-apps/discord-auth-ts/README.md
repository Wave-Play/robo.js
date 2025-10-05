<p align="center">✨ <strong>Generated with <a href="https://roboplay.dev/create-robo">create-robo</a> magic!</strong> ✨</p>

---

# Web App - Discord Authentication (TS)

Welcome to the **Robo.js Auth Starter**, a production-minded web app scaffold that pairs the Robo.js core with **[@robojs/auth](https://docs.roboplay.dev/plugins/auth)**. It gives you:

- A polished React frontend with sign-in, dashboard, and verification flows ready to restyle.
- Auth.js endpoints exposed at `/api/auth/*`, already wired to Discord and email/password flows.
- Session helpers, Flashcore persistence, and resendable verification emails out of the box.

## Table of Contents

- [🔗 Quick Links](#-quick-links)
- [✨ Getting Started](#-getting-started)
- [🧩 What You Get](#-what-you-get)
- [⚙️ Configuration & Secrets](#️-configuration--secrets)
- [🛠️ App Development](#️-app-development)
- [🛠️ Backend Development](#️-backend-development)
- [📁 Folder Structure](#-folder-structure)
- [🔌 Plugins](#-plugins)
- [🚀 Deployment](#-deployment)

## 🔗 Quick Links

- [📚 Robo.js documentation](https://roboplay.dev/docs)
- [📚 @robojs/auth plugin docs](https://roboplay.dev/docs/plugins/auth)
- [✨ Robo community Discord](https://roboplay.dev/discord)

## ✨ Getting Started

Scaffold a project with this template (replace `<project-name>` with yours):

```bash
npx create-robo --template web-apps/discord-auth-ts --name <project-name>
cd <project-name>
```

Install deps and start the dev server:

```bash
npm install
npm run dev
```

> A free Cloudflare tunnel is provisioned automatically. Copy the printed URL if you want to test callbacks from Discord or other providers externally.

## 🧩 What You Get

- **Home page:** marketing-style hero describing Robo.js + @robojs/auth with CTAs to sign in and open the dashboard.
- **Dashboard:** calls `getSession()` to show user metadata, session expiry, verification state, and offers one-click resend + sign-out.
- **Auth routes:** `/api/auth/signin`, `/api/auth/signout`, `/api/auth/verify-email/*`, etc. provided by @robojs/auth.
- **Providers configured:** Discord OAuth plus credentials (email/password) with Flashcore adapter.
- **Mailer integration:** Resend SDK wired for verification and welcome emails (swap for another provider if desired).

## ⚙️ Configuration & Secrets

Copy `.env.example` to `.env` (already done in the template) and set the following environment variables before running locally or deploying:

```bash
AUTH_SECRET="replace-with-long-random-string"
DISCORD_CLIENT_ID=""
DISCORD_CLIENT_SECRET=""
RESEND_API_KEY=""
```

Optional overrides live in `config/plugins/robojs/auth.ts`:

- Update `emails.from` to use your sending domain.
- Swap or add providers (see `@robojs/auth/providers/*`).
- Connect a different adapter such as Prisma instead of Flashcore.

Remember to restart the dev server after changing providers or adapter secrets so @robojs/auth can reload the runtime configuration.

## 🛠️ App Development

Client code sits in `src/app` and uses **React + TanStack Router**. Key entry points:

- `src/app/routes/index.tsx` – homepage hero, quick-start sections, doc links.
- `src/app/routes/dashboard.tsx` – session display, verification resend, sign-out button.
- `src/app/App.css` – global tokens and theme (dark, high-contrast design with sharp edges).

Because Vite powers the stack, you get fast refresh, ESM, and modern tooling. Adjust the styles, copy, or component structure to match your brand.

Helpful helpers from @robojs/auth already imported on the dashboard:

```ts
import { getSession, signOut } from '@robojs/auth'
```

Reuse them anywhere in the frontend or write your own hooks around them.

## 🛠️ Backend Development

Server code lives in `src/api` and is powered by **@robojs/server**. All Auth.js endpoints are already registered there, but you can add custom routes alongside them. Example health check:

```ts
// src/api/health.ts
export default () => ({ status: 'ok' })
```

Need access to the signed-in user on the server? Use @robojs/auth helpers:

```ts
import { getServerSession } from '@robojs/auth'

export default async (request: RoboRequest) => {
  const session = await getServerSession(request)
  return { user: session?.user ?? null }
}
```

## 📁 Folder Structure

```
src/
├─ api/               # File-based HTTP routes (powered by @robojs/server)
├─ app/               # React application (TanStack Router + custom styling)
│  ├─ routes/         # Home + dashboard pages
│  └─ App.css         # Theme tokens for the template
└─ config/plugins/    # Robo plugin registrations (auth config lives here)
```

Feel free to add more directories for commands, events, tooling, or shared libraries. Robo.js will discover them when relevant plugins are installed.

## 🔌 Plugins

Robo.js embraces a plugin-first mindset. Install more skills with a single command:

```bash
npx robo add @robojs/trpc
```

Want to remove one? `npx robo remove <package>`. You can also author your own plugin and drop it into `config/plugins`.

## 🚀 Deployment

When you are ready to ship:

```bash
npm run build
npm start   # self-hosting
```

Or deploy to **RoboPlay** with one command:

```bash
npm run deploy
```

Make sure environment variables are set in your hosting platform. If you are using the Resend mailer, configure the domain and DKIM records so verification emails land reliably.

---

Need help? Drop into the [Robo community Discord](https://roboplay.dev/discord) and share what you are building! 👋
