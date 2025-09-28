import type { EmailContext, TemplateConfig } from '../types.js'

/** Renders the default welcome email subject line. */
export function buildWelcomeSubject(ctx: EmailContext): string {
	const name = ctx.user.name?.trim()
	return name ? `Welcome, ${name}!` : 'Welcome to our app!'
}

/** Produces HTML markup for the default welcome email. */
export function buildWelcomeHtml(ctx: EmailContext): string {
	const name = ctx.user.name?.trim() || 'there'
	const title = `Welcome, ${name}!`
	const intro = 'Thanks for joining — we’re excited to have you on board.'
	const verifyUrl = ctx.links?.verifyEmail ?? '#'
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
      .footer { margin-top:16px; color:#777; font-size:12px; text-align:center; }
      @media (prefers-color-scheme: dark) {
        body{ background:#0b0d12; }
        .card{ background:#131722; box-shadow:0 2px 8px rgba(0,0,0,0.3); }
        p{ color:#d1d5db; }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="card">
        <h1>${title}</h1>
        <p>${intro}</p>
        <p>Confirm your email to fully activate your account.</p>
        <p style="margin:24px 0; text-align:center;">
          <a href="${verifyUrl}" style="display:inline-block; background:#4F46E5; color:#ffffff; text-decoration:none; padding:12px 18px; border-radius:10px; font-weight:600;">
            Confirm Email
          </a>
        </p>
        <p style="font-size:12px; color:#777;">If the button doesn’t work, paste this link in your browser:<br />
          <span style="word-break:break-all; color:#555;">${verifyUrl}</span>
        </p>
      </div>
      <div class="footer">If this wasn’t you, you can ignore this email.</div>
    </div>
  </body>
 </html>`
}

/** Plain-text fallback for the default welcome email. */
export function buildWelcomeText(ctx: EmailContext): string {
	const name = ctx.user.name?.trim() || 'there'
	return `Welcome, ${name}!\n\nThanks for joining — we’re excited to have you on board.\nYou can start exploring right away.`
}

/** Composed welcome template wiring default subject, HTML, and text variants. */
export const DefaultWelcomeTemplate: TemplateConfig = {
	subject: (ctx) => buildWelcomeSubject(ctx),
	html: (ctx) => buildWelcomeHtml(ctx),
	text: (ctx) => buildWelcomeText(ctx)
}
