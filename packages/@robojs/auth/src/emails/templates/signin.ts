import type { EmailContext, TemplateConfig } from '../types.js'

function buildSignInSubject(_ctx: EmailContext): string {
  return 'New sign-in to your account'
}

function buildSignInHtml(ctx: EmailContext): string {
  const title = 'New sign-in to your account'
  const ip = ctx.session?.ip || ''
  const ua = ctx.session?.userAgent || ''
  const details = [ip && `IP: ${ip}`, ua && `Device: ${ua}`].filter(Boolean).join(' · ')
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>${title}</title>
    <style>
      :root { color-scheme: light dark; }
      body { margin:0; background:#f6f7fb; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,Arial,sans-serif; }
      .container { max-width: 600px; margin: 0 auto; padding: 24px; }
      .card { background:#ffffff; border-radius:12px; padding:28px; box-shadow:0 2px 8px rgba(0,0,0,0.05); }
      h1 { margin:0 0 12px; font-size:24px; }
      p { margin:0 0 12px; color:#333; line-height:1.6; }
      .meta { color:#555; font-size:13px; }
      @media (prefers-color-scheme: dark) {
        body{ background:#0b0d12; }
        .card{ background:#131722; box-shadow:0 2px 8px rgba(0,0,0,0.3); }
        p{ color:#d1d5db; }
        .meta{ color:#9aa3b2; }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="card">
        <h1>${title}</h1>
        <p>If this was you, you can ignore this email. If not, please secure your account.</p>
        ${details ? `<p class="meta">${details}</p>` : ''}
      </div>
    </div>
  </body>
 </html>`
}

function buildSignInText(ctx: EmailContext): string {
  const ip = ctx.session?.ip
  const ua = ctx.session?.userAgent
  const lines = [
    'New sign-in to your account.',
    ip ? `IP: ${ip}` : undefined,
    ua ? `Device: ${ua}` : undefined,
    '',
    'If this was you, you can ignore this email. If not, please secure your account.'
  ].filter(Boolean)
  return lines.join('\n')
}

export const DefaultSignInTemplate: TemplateConfig = {
  subject: (ctx) => buildSignInSubject(ctx),
  html: (ctx) => buildSignInHtml(ctx),
  text: (ctx) => buildSignInText(ctx)
}
