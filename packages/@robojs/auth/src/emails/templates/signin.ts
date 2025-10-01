import type { EmailContext, TemplateConfig } from '../types.js'

/** Default subject line used for sign-in notification emails. */
function buildSignInSubject(ctx: EmailContext): string {
	const { appName } = ctx
	return `Sign-in alert for ${appName}`
}

/** HTML renderer for sign-in notifications summarizing request metadata. */
function buildSignInHtml(ctx: EmailContext): string {
	const { appName } = ctx
	const title = `New sign-in detected on ${appName}`
	const ip = ctx.session?.ip || ''
	const ua = ctx.session?.userAgent || ''
	const fontStack = "'Space Grotesk','Segoe UI',Roboto,Inter,Arial,sans-serif"
	const bodyStyles = [
		'margin:0',
		'background-color:#0d1117',
		`font-family:${fontStack}`,
		'color:#e2e8f0'
	].join(';')
	const containerStyles = ['width:100%', 'border-collapse:collapse', 'padding:32px 18px'].join(';')
	const cardStyles = [
		'background-color:#171b21',
		'border:1px solid rgba(148,163,184,0.16)',
		'padding:38px 32px',
		'box-shadow:0 26px 60px rgba(8,24,68,0.45)',
		'line-height:1.6'
	].join(';')
	const metaRows = [
		ip
			? `<tr><td style="padding:12px 0;border-bottom:1px solid rgba(148,163,184,0.18);color:#e2e8f0;font-size:14px;">IP: <span style="color:#38bdf8;">${ip}</span></td></tr>`
			: '',
		ua
			? `<tr><td style="padding:12px 0;color:#e2e8f0;font-size:14px;">Device: <span style="color:#38bdf8;">${ua}</span></td></tr>`
			: ''
	].filter(Boolean)
	return `<!doctype html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <meta name="color-scheme" content="dark light" />
    <title>${title}</title>
  </head>
  <body dir="ltr" style="${bodyStyles}">
    <table role="presentation" width="100%" style="${containerStyles}" lang="en" dir="ltr">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:600px;border-collapse:collapse;">
            <tr>
              <td style="${cardStyles}">
                <h1 style="margin:22px 0 10px;font-size:26px;color:#f8fafc;">New sign-in detected on <strong>${appName}</strong></h1>
				<p style="margin:0 0 12px;color:#d8e2ff;font-size:16px;">We spotted a fresh sign-in to <strong>${appName}</strong>.</p>
                <p style="margin:0 0 20px;color:#d2dcff;font-size:15px;">If this was you, no action is needed. If not, reset your password and review active sessions.</p>
                ${metaRows.length
			? `<table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 20px;background:rgba(15,23,42,0.6);border:1px solid rgba(56,189,248,0.18);padding:16px 24px;">
                      ${metaRows.join('')}
                    </table>`
			: ''}
				<p style="margin:28px 0 0;color:#dbe3ff;font-size:12px;text-align:center;">Need help? Visit your security settings in <strong>${appName}</strong>.</p>
				<p style="margin:16px 0 0;color:#d0d9ff;font-size:11px;text-align:center;">Powered by <a href="https://robojs.dev" style="color:#d4dcff;text-decoration:underline;"><strong>Robo.js</strong></a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/** Plain-text fallback for sign-in notifications. */
function buildSignInText(ctx: EmailContext): string {
	const { appName } = ctx
	const ip = ctx.session?.ip
	const ua = ctx.session?.userAgent
	const lines = [
		`New sign-in detected on **${appName}**.`,
		ip ? `IP: ${ip}` : undefined,
		ua ? `Device: ${ua}` : undefined,
		'',
		'If this was you, no action is needed. If not, reset your password and review active sessions.',
		'',
		'Powered by **Robo.js** (https://robojs.dev)'
	].filter(Boolean)
	return lines.join('\n')
}

/** Bundled sign-in template wiring subject, HTML, and text variants. */
export const DefaultSignInTemplate: TemplateConfig = {
	subject: (ctx) => buildSignInSubject(ctx),
	html: (ctx) => buildSignInHtml(ctx),
	text: (ctx) => buildSignInText(ctx)
}
