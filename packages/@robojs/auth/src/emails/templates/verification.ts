import type { TemplateConfig } from '../types.js'

const APP_NAME = 'Robo Command Center'
const BUTTON_GRADIENT = 'linear-gradient(135deg,#38bdf8,#a855f7)'
const fontStack = "'Space Grotesk','Segoe UI',Roboto,Inter,Arial,sans-serif"
const bodyStyles = [
	'margin:0',
	'background-color:#05070f',
	'background-image:radial-gradient(circle at 25% -20%,#1f2d68 0%,#05070f 62%)',
	`font-family:${fontStack}`,
	'color:#e2e8f0'
].join(';')
const containerStyles = ['width:100%', 'border-collapse:collapse', 'padding:32px 18px'].join(';')
const cardStyles = [
	'background:linear-gradient(155deg,rgba(168,85,247,0.16),rgba(59,130,246,0.06))',
	'background-color:rgba(10,16,32,0.92)',
	'border:1px solid rgba(148,163,184,0.28)',
	'padding:40px 32px',
	'box-shadow:0 28px 70px rgba(8,24,68,0.55)',
	'line-height:1.6'
].join(';')

function buildPrimaryButton(link: string, label: string): string {
	if (!link) return ''
	return `
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:32px auto 28px;">
        <tr>
          <td align="center">
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${link}" style="height:50px;v-text-anchor:middle;width:260px;" arcsize="60%" stroke="f" fillcolor="#38bdf8">
  <w:anchorlock/>
  <center style="color:#081123;font-family:Segoe UI,sans-serif;font-size:16px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;">
    ${label}
  </center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
<a href="${link}" style="display:inline-block;background-image:${BUTTON_GRADIENT};background-color:#38bdf8;color:#081123;font-weight:700;letter-spacing:0.4px;text-decoration:none;text-transform:uppercase;padding:14px 32px;border-radius:999px;box-shadow:0 0 18px rgba(56,189,248,0.45),0 0 34px rgba(168,85,247,0.35);">
  ${label}
</a>
<!--<![endif]-->
          </td>
        </tr>
      </table>`
}

/** Default template for verification emails triggered by Auth.js flows. */
export const DefaultEmailVerificationTemplate: TemplateConfig = {
	subject: () => `Confirm your ${APP_NAME} email address`,
	html: (ctx) => {
		const link = ctx.links?.verifyEmail ?? ctx.tokens?.verifyEmail ?? '#'
		const cardContent = `
    <span style="display:inline-block;padding:6px 14px;background:rgba(168,85,247,0.18);color:#c084fc;font-size:12px;letter-spacing:1.1px;text-transform:uppercase;">Secure Link</span>
    <h1 style="margin:24px 0 12px;font-size:28px;color:#f8fafc;">Verify your email for ${APP_NAME}</h1>
    <p style="margin:0 0 12px;color:#cbd5f5;font-size:16px;">Hello${ctx.user.name ? ` ${ctx.user.name}` : ''}, confirm your email to finish signing in to ${APP_NAME}.</p>
    <p style="margin:0 0 20px;color:#a5b4fc;font-size:15px;">This keeps your cockpit protected and enables account recovery across ${APP_NAME}.</p>
    ${buildPrimaryButton(link, 'Verify email')}
    <table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 24px;">
      <tr>
        <td style="padding:18px 20px;background:rgba(15,23,42,0.72);border:1px solid rgba(148,163,184,0.24);">
          <p style="margin:0 0 6px;color:#38bdf8;font-size:13px;letter-spacing:0.6px;text-transform:uppercase;">Backup code</p>
          <p style="margin:0;color:#e2e8f0;font-size:14px;">If the button doesn’t work, copy this link into your browser.</p>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#cbd5f5;font-size:13px;word-break:break-all;">${link}</p>
    <p style="margin:28px 0 0;color:#64748b;font-size:12px;text-align:center;">If you weren’t expecting this email, ignore it and your ${APP_NAME} access stays locked.</p>
  `
		return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <meta name="color-scheme" content="dark light" />
    <title>Verify your email</title>
  </head>
  <body style="${bodyStyles}">
    <table role="presentation" width="100%" style="${containerStyles}">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:600px;border-collapse:collapse;">
            <tr>
              <td style="${cardStyles}">
                ${cardContent}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
	},
	text: (ctx) => {
		const link = ctx.links?.verifyEmail ?? ctx.tokens?.verifyEmail ?? ''
		return [
			`Verify your email to finish signing in to ${APP_NAME}.`,
			'',
			link ? `Verification link: ${link}` : undefined,
			'',
			`If you did not request this email, you can ignore it and your ${APP_NAME} access stays locked.`
		]
			.filter(Boolean)
			.join('\n')
	}
}
