import type { EmailContext, TemplateConfig } from '../types.js'
const BUTTON_PRIMARY_FROM = '#1d4ed8'
const BUTTON_PRIMARY_TO = '#38bdf8'

/** Renders the default welcome email subject line. */
export function buildWelcomeSubject(ctx: EmailContext): string {
	const appName = ctx.appName
	const name = ctx.user.name?.trim()
	return name ? `Welcome to ${appName}, ${name}` : `Welcome to ${appName}`
}

/** Produces HTML markup for the default welcome email. */
export function buildWelcomeHtml(ctx: EmailContext): string {
	const appName = ctx.appName
	const name = ctx.user.name?.trim() || 'there'
	const title = `Welcome to ${appName}, ${name}`
	const verifyUrl = ctx.links?.verifyEmail ?? '#'
	const fontStack = "'Space Grotesk','Segoe UI',Roboto,Inter,Arial,sans-serif"
	const bodyStyles = [
		'margin:0',
		'background-color:#0d1117',
		`font-family:${fontStack}`,
		'color:#e2e8f0'
	].join(';')
	const containerStyles = [
		'width:100%',
		'border-collapse:collapse',
		'padding:32px 18px'
	].join(';')
	const cardStyles = [
		'background-color:#171b21',
		'border:1px solid rgba(148,163,184,0.16)',
		'padding:40px 32px',
		'box-shadow:0 28px 60px rgba(8,31,68,0.45)',
		'line-height:1.6'
	].join(';')
	const buttonLabel = 'Confirm Email'
	const buttonMarkup = verifyUrl
		? `
            <table role="presentation" cellspacing="0" cellpadding="0" style="margin:36px auto 32px;">
              <tr>
                <td align="center">
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${verifyUrl}" style="height:50px;v-text-anchor:middle;width:260px;" arcsize="15%" stroke="t" strokecolor="#60a5fa" fillcolor="${BUTTON_PRIMARY_FROM}" alt="${buttonLabel}">
  <w:anchorlock/>
  <center style="color:#f8fafc;font-family:Segoe UI,sans-serif;font-size:16px;font-weight:700;letter-spacing:0.4px;text-transform:none;">
    ${buttonLabel}
  </center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
<a href="${verifyUrl}" style="display:inline-block;background-image:linear-gradient(135deg, ${BUTTON_PRIMARY_FROM}, ${BUTTON_PRIMARY_TO});color:#f8fafc;font-weight:700;letter-spacing:0.4px;text-decoration:none;text-transform:none;padding:9px 28px;border-radius:10px;box-shadow:0 18px 32px -18px rgba(37,99,235,0.65);border:1px solid rgba(96,165,250,0.6);">
  ${buttonLabel}
</a>
<!--<![endif]-->
                </td>
              </tr>
            </table>`
		: ''
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
                <h1 style="margin:24px 0 12px;font-size:28px;color:#f8fafc;">Welcome to <strong>${appName}</strong>, ${name}</h1>
                <p style="margin:0 0 12px;color:#d8e2ff;font-size:16px;">Thanks for joining <strong>${appName}</strong>. You now have access to your new workspace.</p>
                <p style="margin:0 0 12px;color:#d2dcff;font-size:15px;">Confirm your email to finish unlocking everything <strong>${appName}</strong> offers.</p>
                ${buttonMarkup}
                <table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 24px;">
                  <tr>
                    <td style="padding:18px 20px;background:rgba(15,23,42,0.6);border:1px solid rgba(59,130,246,0.18);">
                      <p style="margin:0 0 6px;color:#38bdf8;font-size:13px;font-weight:600;">Getting started</p>
                      <p style="margin:0;color:#e2e8f0;font-size:15px;">Verify your email · Share <strong>${appName}</strong> with your team.</p>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 18px;color:#d4dcff;font-size:13px;">Can’t click the button? Copy this link into your browser:</p>
                <p style="margin:0;color:#e2e8f0;font-size:13px;word-break:break-all;">${verifyUrl}</p>
                <p style="margin:28px 0 0;color:#dbe3ff;font-size:12px;text-align:center;">If this wasn’t you, you can safely ignore this email and <strong>${appName}</strong> access remains secure.</p>
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

/** Plain-text fallback for the default welcome email. */
export function buildWelcomeText(ctx: EmailContext): string {
	const appName = ctx.appName
	const name = ctx.user.name?.trim() || 'there'
	return [
		`Welcome to **${appName}**, ${name}.`,
		'',
		`Thanks for joining **${appName}** — confirm your email to unlock every feature.`,
		ctx.links?.verifyEmail ? `Confirm your email: ${ctx.links.verifyEmail}` : undefined,
		'',
		`If this email wasn’t expected, you can ignore it and your **${appName}** access stays protected.`,
		'',
		'Powered by **Robo.js** (https://robojs.dev)'
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
