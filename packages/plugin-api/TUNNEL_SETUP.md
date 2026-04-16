# Persistent Cloudflare Tunnel Setup

Reference notes for documenting `@robojs/server`'s persistent tunnel feature. When fully configured, your bot is exposed at `https://robo.<your-domain>` instead of a random `*.trycloudflare.com` URL.

## Required credentials

All four values must be provided. If any are missing, the plugin falls back to a dynamic quick tunnel.

| Variable | Where to find it |
|---|---|
| `CLOUDFLARE_DOMAIN` | The root domain you own and have added to Cloudflare (e.g. `example.com`). Tunnel will be exposed at `robo.<domain>`. |
| `CLOUDFLARE_API_KEY` | A **scoped API Token** (not the Global API Key). Create at https://dash.cloudflare.com/profile/api-tokens. See permissions below. |
| `CLOUDFLARE_ZONE_ID` | Cloudflare dashboard → select your domain → right sidebar → **Zone ID**. |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → right sidebar → **Account ID**. |

### API Token permissions

The token must be created via **Create Token → Custom Token** with:

- `Account` → `Cloudflare Tunnel` → **Edit**
- `Zone` → `DNS` → **Edit**

Scope it to the specific account and zone you intend to use. The legacy Global API Key will not work — the code uses bearer-token auth.

## Auto-managed credentials

These are written to your `.env` file automatically on first run. Do not set them manually:

| Variable | Purpose |
|---|---|
| `CLOUDFLARE_TUNNEL_ID` | UUID of the tunnel created on your account (named `robo`). |
| `CLOUDFLARE_TUNNEL_TOKEN` | Token used by the local `cloudflared` process to authenticate with the tunnel. |

## Configuration alternatives

Credentials can also be passed via plugin config in `config/plugins/robojs/server.ts`:

```ts
export default {
  tunnel: {
    enabled: true,
    cloudflare: {
      domain: 'example.com',
      apiKey: '...',
      zoneId: '...',
      accountId: '...'
    }
  }
}
```

Plugin config takes precedence over environment variables.

## How it works

On server start, when tunneling is enabled (via `tunnel.enabled: true` in config or the `-t` CLI flag):

1. **Install** — Downloads `cloudflared` to `.robo/bin/` if missing.
2. **Initialize** — If full credentials are present:
   - Looks up an existing tunnel named `robo` on your account, or creates one.
   - Fetches the tunnel token and writes `CLOUDFLARE_TUNNEL_ID` + `CLOUDFLARE_TUNNEL_TOKEN` to `.env`.
   - Sets ingress rules: `robo.<domain>` → `http://localhost:<PORT>`.
   - Creates/updates a CNAME DNS record: `robo.<domain>` → `<tunnel-id>.cfargotunnel.com` (proxied).
3. **Start** — Spawns `cloudflared tunnel run` with the token. The tunnel is reachable at `https://robo.<domain>`.

If no credentials are provided, step 2 is skipped and a dynamic `*.trycloudflare.com` URL is used instead.

## Common errors

### `Cloudflare authentication failed: ...`

Your `CLOUDFLARE_API_KEY` was rejected. Causes:

- Using the Global API Key instead of a scoped API Token.
- Token missing `Cloudflare Tunnel:Edit` or `DNS:Edit` permissions.
- Token scoped to a different account/zone than `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_ZONE_ID`.

### `Persistent tunnel setup failed — aborting tunnel start`

The plugin detected full credentials but `initialize()` failed. The actual cause is logged above this line. The plugin aborts (rather than silently falling back to a quick tunnel) so the failure isn't masked.

### `Failed to start tunnel: The system cannot find the path specified`

The `cloudflared` binary wasn't installed. The plugin should auto-install on start; if this error persists, check that `.robo/bin/` is writable and your network can reach `https://github.com/cloudflare/cloudflared/releases/`.

## File reference

- `src/robo/start.ts` — `startTunnel()` orchestrates install → initialize → start.
- `src/core/tunnel/providers/cloudflare.ts` — Cloudflare API calls, tunnel/DNS management, `cloudflared` process control.
- `src/robo/cli/extend/dev.ts` — Adds the `-t` flag to `robo dev`; just sets `__ROBO_TUNNEL_ENABLED=true`.

The user-facing docs live at `docs/content/docs/server/tunnels.mdx` in the robo.js repo.
