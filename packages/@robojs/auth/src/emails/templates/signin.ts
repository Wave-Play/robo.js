import type { EmailContext, TemplateConfig } from '../types.js'

const APP_NAME = 'Robo Command Center'

/** Default subject line used for sign-in notification emails. */
function buildSignInSubject(_ctx: EmailContext): string {
	return `Sign-in alert for ${APP_NAME}`
}

/** HTML renderer for sign-in notifications summarizing request metadata. */
function buildSignInHtml(ctx: EmailContext): string {
	const title = `New sign-in detected on ${APP_NAME}`
	const ip = ctx.session?.ip || ''
	const ua = ctx.session?.userAgent || ''
	const fontStack = "'Space Grotesk','Segoe UI',Roboto,Inter,Arial,sans-serif"
	const bodyStyles = [
		'margin:0',
		'background-color:#05070f',
		'background-image:radial-gradient(circle at 20% -10%,#1b2755 0%,#05070f 65%)',
		`font-family:${fontStack}`,
		'color:#e2e8f0'
	].join(';')
	const containerStyles = ['width:100%', 'border-collapse:collapse', 'padding:32px 18px'].join(';')
	const cardStyles = [
		'background:linear-gradient(160deg,rgba(56,189,248,0.18),rgba(59,130,246,0.04))',
		'background-color:rgba(11,17,32,0.92)',
		'border:1px solid rgba(148,163,184,0.28)',
		'padding:38px 32px',
		'box-shadow:0 26px 70px rgba(8,24,68,0.55)',
		'line-height:1.6'
	].join(';')
	const labelStyles = [
		'display:inline-block',
		'padding:6px 14px',
		'background:rgba(251,191,36,0.14)',
		'color:#facc15',
		'font-size:12px',
		'letter-spacing:1.1px',
		'text-transform:uppercase'
	].join(';')
	const metaRows = [
		ip ? `<tr><td style="padding:10px 0;border-bottom:1px solid rgba(148,163,184,0.18);color:#e2e8f0;font-size:14px;">IP: <span style="color:#38bdf8;">${ip}</span></td></tr>` : '',
		ua ? `<tr><td style="padding:10px 0;color:#e2e8f0;font-size:14px;">Device: <span style="color:#38bdf8;">${ua}</span></td></tr>` : ''
	].filter(Boolean)
	return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <meta name="color-scheme" content="dark light" />
    <title>${title}</title>
  </head>
  <body style="${bodyStyles}">
    <table role="presentation" width="100%" style="${containerStyles}">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:600px;border-collapse:collapse;">
            <tr>
              <td style="${cardStyles}">
                <span style="${labelStyles}">Security Signal</span>
                <h1 style="margin:22px 0 10px;font-size:26px;color:#f8fafc;">${title}</h1>
                <p style="margin:0 0 12px;color:#cbd5f5;font-size:16px;">We spotted a fresh sign-in to ${APP_NAME}.</p>
                <p style="margin:0 0 20px;color:#a5b4fc;font-size:15px;">If this was you, no action is needed. If not, reset your password and review active sessions.</p>
                ${metaRows.length
			? `<table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 20px;background:rgba(15,23,42,0.72);border:1px solid rgba(56,189,248,0.24);padding:0 20px;">
                      ${metaRows.join('')}
                    </table>`
			: ''}
                <p style="margin:28px 0 0;color:#64748b;font-size:12px;text-align:center;">Need help? Visit your security settings in ${APP_NAME}.</p>
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
	const ip = ctx.session?.ip
	const ua = ctx.session?.userAgent
	const lines = [
		`New sign-in detected on ${APP_NAME}.`,
		ip ? `IP: ${ip}` : undefined,
		ua ? `Device: ${ua}` : undefined,
		'',
		'If this was you, no action is needed. If not, reset your password and review active sessions.'
	].filter(Boolean)
	return lines.join('\n')
}

/** Bundled sign-in template wiring subject, HTML, and text variants. */
export const DefaultSignInTemplate: TemplateConfig = {
	subject: (ctx) => buildSignInSubject(ctx),
	html: (ctx) => buildSignInHtml(ctx),
	text: (ctx) => buildSignInText(ctx)
}
