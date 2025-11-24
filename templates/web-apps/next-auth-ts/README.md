<p align="center">✨ <strong>Generated with <a href="https://robojs.dev/create-robo">create-robo</a> magic!</strong> ✨</p>

---

# Web App - Next.js + Auth (TS)

Welcome to the **Next.js + Auth** starter for **[Robo.js](https://robojs.dev)**! 🚀

This template combines the power of **Next.js (App Router)**, **Prisma**, and **[@robojs/auth](https://robojs.dev/plugins/auth)** to give you a full-stack web application with authentication, database, and server-side logic ready to go.

It comes pre-configured with:
- **🔐 Authentication**: Discord OAuth and Email/Password login via `@robojs/auth`.
- **🗄️ Database**: SQLite database with **Prisma** ORM.
- **⚛️ Frontend**: Next.js 15+ (App Router) with React Server Components.
- **🛠️ Backend**: Robo.js server for API routes and plugin management.

_Ready to build something amazing?_

## Table of Contents

- [🔗 Quick Links](#-quick-links)
- [✨ Getting Started](#-getting-started)
- [🔐 Authentication](#-authentication)
- [🗄️ Database (Prisma)](#️-database-prisma)
- [🛠️ App Development](#️-app-development)
- [⚙️ Configuration](#️-configuration)
- [📁 Folder Structure](#-folder-structure)
- [🚀 Deployment](#-deployment)

## 🔗 Quick Links

- [📚 **Robo.js Documentation**](https://robojs.dev)
- [🔐 **@robojs/auth Docs**](https://github.com/Wave-Play/robo.js/tree/main/packages/%40robojs/auth)
- [📘 **Next.js Documentation**](https://nextjs.org/docs)
- [🗃️ **Prisma Documentation**](https://www.prisma.io/docs)
- [✨ **Discord Community**](https://robojs.dev/discord)

## ✨ Getting Started

Create a new project with this template:

```bash
npx create-robo --template web-apps/next-auth-ts --name my-awesome-app
```

Navigate to your project:

```bash
cd my-awesome-app
```

Install dependencies:

```bash
npm install
```

### 1. Environment Setup

Fill in your secrets in `.env`:
- `AUTH_SECRET`: A long random string for session security.
- `DISCORD_CLIENT_ID` & `DISCORD_CLIENT_SECRET`: From your [Discord Developer Portal](https://discord.com/developers/applications).
- `RESEND_API_KEY`: (Optional) For sending emails via Resend.

### 2. Database Setup

Initialize your SQLite database:

```bash
npx prisma migrate dev --name init
```

### 3. Run It!

Start the development server:

```bash
npm run dev
```

Visit `http://localhost:3000` to see your app in action!

## 🔐 Authentication

This template uses **[@robojs/auth](https://robojs.dev/plugins/auth)** to handle user authentication. It's fully integrated with the Next.js frontend and the Prisma database.

### Features
- **Sign In/Up**: Pre-built pages at `/login` and `/signup`.
- **Providers**: Discord (OAuth) and Email/Password configured by default.
- **Session Management**: `useSession` hook for client components and `getServerSession` for server components.
- **Protected Routes**: Example dashboard at `/dashboard`.

### Configuration
Auth configuration lives in `config/plugins/robojs/auth.ts`. You can add more providers (Google, GitHub, etc.) or customize pages here.

```typescript
// config/plugins/robojs/auth.ts
import Discord from '@robojs/auth/providers/discord'
// ...

const config: AuthPluginOptions = {
  // ...
  providers: [
    Discord({ clientId: process.env.DISCORD_CLIENT_ID, clientSecret: process.env.DISCORD_CLIENT_SECRET }),
    // Add more providers here!
  ],
}
```

## 🗄️ Database (Prisma)

We use **Prisma** as the ORM to interact with the SQLite database.

- **Schema**: Defined in `prisma/schema.prisma`.
- **Client**: Access the database via the global `prisma` instance (exported in `config/plugins/robojs/auth.ts` or similar).

### Modifying the Schema
1. Edit `prisma/schema.prisma`.
2. Run `npx prisma migrate dev --name <migration-name>` to apply changes and generate the client.

The default schema includes models for `User`, `Account`, `Session`, and `Password` to support the auth system.

### Alternative: Flashcore

Don't need a full SQL database? You can use **Flashcore**, the built-in key-value store powered by Robo.js. It's zero-config and perfect for simple apps or prototyping.

To switch to Flashcore, update `config/plugins/robojs/auth.ts`:

```typescript
import { createFlashcoreAdapter } from '@robojs/auth'

// ...

// Replace the Prisma adapter with Flashcore
const adapter = createFlashcoreAdapter()

const config: AuthPluginOptions = {
  adapter,
  // ...
}
```

## 🛠️ App Development

### Frontend (`/app`)
The `app` directory contains your Next.js App Router code.
- `page.tsx`: The landing page.
- `layout.tsx`: Root layout with `SessionProvider`.
- `dashboard/`: Protected route example.
- `api/`: Next.js API routes (if needed).

### Backend (`/src/api`)
Robo.js powers the backend server. You can create API routes in `src/api` that run alongside Next.js.
- **File-based routing**: `src/api/health.ts` -> `/api/health`.
- **Robo Plugins**: Easily add features like AI, Sync, or Triggers.

## ⚙️ Configuration

### Environment Variables
| Variable | Description |
| --- | --- |
| `DATABASE_URL` | Connection string for Prisma (default: `file:./dev.db`) |
| `AUTH_SECRET` | Secret used to sign session tokens |
| `DISCORD_CLIENT_ID` | Discord App Client ID |
| `DISCORD_CLIENT_SECRET` | Discord App Client Secret |
| `RESEND_API_KEY` | API Key for Resend (email provider) |

### Robo Config
- `config/robo.ts`: Main Robo.js configuration.
- `config/plugins/`: Plugin-specific configurations.

## 📁 Folder Structure

```
.
├── app/                  # Next.js App Router (Frontend)
│   ├── api/              # Next.js API routes
│   ├── dashboard/        # Protected dashboard page
│   ├── login/            # Login page
│   ├── signup/           # Signup page
│   └── ...
├── config/               # Configuration files
│   ├── plugins/          # Plugin configs (@robojs/auth, etc.)
│   └── robo.ts           # Main Robo config
├── prisma/               # Prisma schema and migrations
├── public/               # Static assets
├── src/                  # Robo.js Backend Source
│   ├── api/              # Robo.js API routes
│   └── ...
├── .env                  # Environment variables
└── package.json
```

## 🚀 Deployment

1. **Build the project**:
   ```bash
   npm run build
   ```
   This builds both the Next.js app and the Robo.js server.

2. **Start the server**:
   ```bash
   npm start
   ```

You can deploy this to any host that supports Node.js (VPS, Railway, Render, etc.) or use **[RoboPlay](https://roboplay.dev)** for an optimized experience.
