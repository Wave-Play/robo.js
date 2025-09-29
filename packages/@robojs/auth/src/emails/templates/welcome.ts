import type { EmailContext, TemplateConfig } from '../types.js'

const APP_NAME = 'Robo Command Center'
const BUTTON_GRADIENT = 'linear-gradient(135deg,#38bdf8,#a855f7)'

/** Renders the default welcome email subject line. */
export function buildWelcomeSubject(ctx: EmailContext): string {
	const name = ctx.user.name?.trim()
	return name ? `Welcome to ${APP_NAME}, ${name}` : `Welcome to ${APP_NAME}`
}

/** Produces HTML markup for the default welcome email. */
export function buildWelcomeHtml(ctx: EmailContext): string {
	const name = ctx.user.name?.trim() || 'there'
	const title = `Welcome to ${APP_NAME}, ${name}`
	const verifyUrl = ctx.links?.verifyEmail ?? '#'
	const fontStack = "'Space Grotesk','Segoe UI',Roboto,Inter,Arial,sans-serif"
	const bodyStyles = [
		'margin:0',
		'background-color:#05070f',
		'background-image:radial-gradient(circle at top,#16213f 0%,#05070f 55%)',
		`font-family:${fontStack}`,
		'color:#e2e8f0'
	].join(';')
	const containerStyles = [
		'width:100%',
		'border-collapse:collapse',
		'padding:32px 18px'
	].join(';')
	const cardStyles = [
		'background:linear-gradient(150deg,rgba(56,189,248,0.14),rgba(168,85,247,0.08))',
		'background-color:rgba(12,18,34,0.86)',
		'border:1px solid rgba(148,163,184,0.22)',
		'padding:40px 32px',
		'box-shadow:0 28px 60px rgba(8,31,68,0.55)',
		'backdrop-filter:saturate(180%)',
		'line-height:1.6'
	].join(';')
	const labelStyles = [
		'display:inline-block',
		'padding:6px 14px',
		'background:rgba(56,189,248,0.14)',
		'color:#38bdf8',
		'font-size:12px',
		'letter-spacing:1.2px',
		'text-transform:uppercase'
	].join(';')
	const buttonLabel = 'Confirm Email'
	const buttonMarkup = verifyUrl
		? `
            <table role="presentation" cellspacing="0" cellpadding="0" style="margin:36px auto 32px;">
              <tr>
                <td align="center">
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${verifyUrl}" style="height:50px;v-text-anchor:middle;width:260px;" arcsize="60%" stroke="f" fillcolor="#38bdf8">
  <w:anchorlock/>
  <center style="color:#081123;font-family:Segoe UI,sans-serif;font-size:16px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;">
    ${buttonLabel}
  </center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
<a href="${verifyUrl}" style="display:inline-block;background-image:${BUTTON_GRADIENT};background-color:#38bdf8;color:#081123;font-weight:700;letter-spacing:0.4px;text-decoration:none;text-transform:uppercase;padding:14px 32px;border-radius:999px;box-shadow:0 0 18px rgba(56,189,248,0.45),0 0 34px rgba(168,85,247,0.35);">
  ${buttonLabel}
</a>
<!--<![endif]-->
                </td>
              </tr>
            </table>`
		: ''
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
                <span style="${labelStyles}">Access Granted</span>
                <h1 style="margin:24px 0 12px;font-size:28px;color:#f8fafc;">${title}</h1>
                <p style="margin:0 0 12px;color:#cbd5f5;font-size:16px;">Thanks for joining ${APP_NAME}. Your command center is ready.</p>
                <p style="margin:0 0 12px;color:#a5b4fc;font-size:15px;">Confirm your email to finish unlocking ${APP_NAME} features.</p>
                ${buttonMarkup}
                <table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 24px;">
                  <tr>
                    <td style="padding:18px 20px;background:rgba(15,23,42,0.72);border:1px solid rgba(59,130,246,0.22);">
                      <p style="margin:0 0 6px;color:#38bdf8;font-size:13px;letter-spacing:0.6px;text-transform:uppercase;">Mission Checklist</p>
                      <p style="margin:0;color:#e2e8f0;font-size:15px;">Verify your email · Personalize your profile · Invite your team to ${APP_NAME}.</p>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 18px;color:#94a3b8;font-size:13px;">Can’t click the button? Copy this link into your browser:</p>
                <p style="margin:0;color:#cbd5f5;font-size:13px;word-break:break-all;">${verifyUrl}</p>
                <p style="margin:28px 0 0;color:#64748b;font-size:12px;text-align:center;">If this wasn’t you, you can safely ignore this email and ${APP_NAME} access remains secure.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/** Plain-text fallback for the default welcome email. */
export function buildWelcomeText(ctx: EmailContext): string {
	const name = ctx.user.name?.trim() || 'there'
	return [
		`Welcome to ${APP_NAME}, ${name}.`,
		'',
		`Thanks for joining ${APP_NAME} — confirm your email to unlock every feature.`,
		ctx.links?.verifyEmail ? `Confirm your email: ${ctx.links.verifyEmail}` : undefined,
		'',
		`If this email wasn’t expected, you can ignore it and your ${APP_NAME} access stays locked.`
	]
		.filter(Boolean)
		.join('\n')
}

/** Composed welcome template wiring default subject, HTML, and text variants. */
export const DefaultWelcomeTemplate: TemplateConfig = {
	subject: (ctx) => buildWelcomeSubject(ctx),
	html: (ctx) => buildWelcomeHtml(ctx),
	text: (ctx) => buildWelcomeText(ctx)
}
