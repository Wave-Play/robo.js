import type { TemplateConfig } from '../types.js'
const BUTTON_PRIMARY_FROM = '#1d4ed8'
const BUTTON_PRIMARY_TO = '#38bdf8'
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
	'padding:40px 32px',
	'box-shadow:0 28px 60px rgba(8,24,68,0.45)',
	'line-height:1.6'
].join(';')

function buildPrimaryButton(link: string, label: string): string {
	if (!link) return ''
	return `
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:32px auto 28px;">
        <tr>
          <td align="center">
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${link}" style="height:50px;v-text-anchor:middle;width:260px;" arcsize="15%" stroke="t" strokecolor="#60a5fa" fillcolor="${BUTTON_PRIMARY_FROM}" alt="${label}">
  <w:anchorlock/>
  <center style="color:#f8fafc;font-family:Segoe UI,sans-serif;font-size:16px;font-weight:700;letter-spacing:0.4px;text-transform:none;">
    ${label}
  </center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
<a href="${link}" style="display:inline-block;background-image:linear-gradient(135deg, ${BUTTON_PRIMARY_FROM}, ${BUTTON_PRIMARY_TO});color:#f8fafc;font-weight:700;letter-spacing:0.4px;text-decoration:none;text-transform:none;padding:9px 28px;border-radius:10px;box-shadow:0 18px 32px -18px rgba(37,99,235,0.65);border:1px solid rgba(96,165,250,0.6);">
  ${label}
</a>
<!--<![endif]-->
          </td>
        </tr>
      </table>`
}

/** Default template for verification emails triggered by Auth.js flows. */
export const DefaultEmailVerificationTemplate: TemplateConfig = {
	subject: (ctx) => `Confirm your ${ctx.appName} email address`,
	html: (ctx) => {
		const appName = ctx.appName
		const link = ctx.links?.verifyEmail ?? ctx.tokens?.verifyEmail ?? '#'
		const cardContent = `
    <h1 style="margin:24px 0 12px;font-size:28px;color:#f8fafc;">Verify your email for <strong>${appName}</strong></h1>
    <p style="margin:0 0 12px;color:#d8e2ff;font-size:16px;">Hello${ctx.user.name ? ` ${ctx.user.name}` : ''}, confirm your email to finish signing in to <strong>${appName}</strong>.</p>
    <p style="margin:0 0 20px;color:#d2dcff;font-size:15px;">This keeps your account protected and enables recovery options across <strong>${appName}</strong>.</p>
    ${buildPrimaryButton(link, 'Verify email')}
    <table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 24px;">
      <tr>
	        <td style="padding:18px 20px;background:rgba(15,23,42,0.6);border:1px solid rgba(148,163,184,0.18);">
          <p style="margin:0 0 6px;color:#38bdf8;font-size:13px;font-weight:600;">Don’t see the button?</p>
          <p style="margin:0;color:#e2e8f0;font-size:14px;">Copy and paste the verification link into your browser instead.</p>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#e2e8f0;font-size:13px;word-break:break-all;">${link}</p>
    <p style="margin:28px 0 0;color:#dbe3ff;font-size:12px;text-align:center;">If you weren’t expecting this email, ignore it and your <strong>${appName}</strong> access stays locked.</p>
    <p style="margin:16px 0 0;color:#d0d9ff;font-size:11px;text-align:center;">Powered by <a href="https://robojs.dev" style="color:#d4dcff;text-decoration:underline;"><strong>Robo.js</strong></a></p>
  `
		return `<!doctype html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <meta name="color-scheme" content="dark light" />
    <title>Verify your email</title>
  </head>
  <body dir="ltr" style="${bodyStyles}">
    <table role="presentation" width="100%" style="${containerStyles}" lang="en" dir="ltr">
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
			`Verify your email to finish signing in to **${ctx.appName}**.`,
			'',
			link ? `Verification link: ${link}` : undefined,
			'',
			`If you did not request this email, you can ignore it and your **${ctx.appName}** access stays locked.`,
			'',
			'Powered by **Robo.js** (https://robojs.dev)'
		]
			.filter(Boolean)
			.join('\n')
	}
}
