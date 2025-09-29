import type { EmailContext, TemplateConfig } from '../types.js'

const APP_NAME = 'Robo Command Center'
const BUTTON_GRADIENT = 'linear-gradient(135deg,#38bdf8,#a855f7)'
const fontStack = "'Space Grotesk','Segoe UI',Roboto,Inter,Arial,sans-serif"
const bodyStyles = [
	'margin:0',
	'background-color:#05070f',
	'background-image:radial-gradient(circle at 15% -10%,#1b2755 0%,#05070f 60%)',
	`font-family:${fontStack}`,
	'color:#e2e8f0'
].join(';')
const containerStyles = ['width:100%', 'border-collapse:collapse', 'padding:32px 18px'].join(';')
const cardStyles = [
	'background:linear-gradient(150deg,rgba(56,189,248,0.14),rgba(37,99,235,0.06))',
	'background-color:rgba(10,17,34,0.9)',
	'border:1px solid rgba(148,163,184,0.26)',
	'padding:40px 32px',
	'box-shadow:0 26px 70px rgba(8,24,68,0.55)',
	'line-height:1.6'
].join(';')

function wrapEmail(title: string, cardContent: string): string {
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
                ${cardContent}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function buildPrimaryButton(link: string, label: string): string {
	if (!link) return ''
	return `
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:32px auto 28px;">
        <tr>
          <td align="center">
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${link}" style="height:50px;v-text-anchor:middle;width:280px;" arcsize="60%" stroke="f" fillcolor="#38bdf8">
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

function buildResetRequestSubject(): string {
	return `Reset your ${APP_NAME} password`
}

/** HTML body encouraging a user to choose a new password. */
function buildResetRequestHtml(ctx: EmailContext): string {
	const title = `Reset your ${APP_NAME} password`
	const resetLink = ctx.links?.resetPassword ?? null
	const fallback = resetLink
		? `<p style="margin:0;color:#cbd5f5;font-size:13px;word-break:break-all;">${resetLink}</p>`
		: ''
	const cardContent = `
    <span style="display:inline-block;padding:6px 14px;background:rgba(34,197,94,0.18);color:#4ade80;font-size:12px;letter-spacing:1.1px;text-transform:uppercase;">Credential Support</span>
    <h1 style="margin:24px 0 12px;font-size:28px;color:#f8fafc;">${title}</h1>
    <p style="margin:0 0 12px;color:#cbd5f5;font-size:16px;">We received a request to reset your ${APP_NAME} password. Use the secure link below to continue.</p>
    <p style="margin:0 0 20px;color:#a5b4fc;font-size:15px;">The link expires soon to keep your ${APP_NAME} account protected.</p>
    ${buildPrimaryButton(resetLink ?? '', 'Choose a new password')}
    <table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 24px;">
      <tr>
        <td style="padding:18px 20px;background:rgba(15,23,42,0.72);border:1px solid rgba(56,189,248,0.22);">
          <p style="margin:0 0 6px;color:#38bdf8;font-size:13px;letter-spacing:0.6px;text-transform:uppercase;">Can’t access the button?</p>
          <p style="margin:0;color:#e2e8f0;font-size:14px;">Copy and paste the recovery link instead.</p>
        </td>
      </tr>
    </table>
    ${fallback}
    <p style="margin:28px 0 0;color:#64748b;font-size:12px;text-align:center;">If you didn’t ask for this, you can safely ignore the message and your ${APP_NAME} access stays secure.</p>
  `
	return wrapEmail(title, cardContent)
}

/** Plain-text variant for the password reset request email. */
function buildResetRequestText(ctx: EmailContext): string {
	const link = ctx.links?.resetPassword ?? ''
	const lines = [
		`We received a request to reset the password for your ${APP_NAME} account.`,
		link ? `Use this secure link to choose a new password: ${link}` : undefined,
		'',
		`If you did not request this change, you can ignore this email and your ${APP_NAME} access remains unchanged.`
	].filter(Boolean)
	return lines.join('\n')
}

/** Template bundle powering password reset request notifications. */
export const DefaultPasswordResetRequestTemplate: TemplateConfig = {
	subject: () => buildResetRequestSubject(),
	html: (ctx) => buildResetRequestHtml(ctx),
	text: (ctx) => buildResetRequestText(ctx)
}

/** Subject sent once a user successfully changes their password. */
function buildResetCompletedSubject(): string {
	return `Your ${APP_NAME} password was changed`
}

/** HTML copy used for password reset completion emails. */
function buildResetCompletedHtml(): string {
	const title = `Your ${APP_NAME} password was changed`
	const cardContent = `
    <span style="display:inline-block;padding:6px 14px;background:rgba(56,189,248,0.16);color:#38bdf8;font-size:12px;letter-spacing:1.1px;text-transform:uppercase;">Change Confirmed</span>
    <h1 style="margin:24px 0 12px;font-size:28px;color:#f8fafc;">${title}</h1>
    <p style="margin:0 0 12px;color:#cbd5f5;font-size:16px;">Your ${APP_NAME} password was updated successfully.</p>
    <p style="margin:0 0 18px;color:#a5b4fc;font-size:15px;">If this update looks unfamiliar, reset the password again and review your active sessions.</p>
    <table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 24px;">
      <tr>
        <td style="padding:18px 20px;background:rgba(15,23,42,0.72);border:1px solid rgba(56,189,248,0.22);">
          <p style="margin:0 0 6px;color:#38bdf8;font-size:13px;letter-spacing:0.6px;text-transform:uppercase;">What’s next</p>
          <p style="margin:0;color:#e2e8f0;font-size:14px;">Review devices, enable two-factor authentication, and keep your recovery codes handy.</p>
        </td>
      </tr>
    </table>
    <p style="margin:28px 0 0;color:#64748b;font-size:12px;text-align:center;">Need support? Reply to this email and our team will help keep your ${APP_NAME} account secure.</p>
  `
	return wrapEmail(title, cardContent)
}

/** Plain-text fallback for password reset completion notifications. */
function buildResetCompletedText(): string {
	return [
		`Your ${APP_NAME} password was just changed.`,
		'',
		'If this was not you, reset your password again and review your active sessions.'
	].join('\n')
}

/** Template pack acknowledging password reset completion. */
export const DefaultPasswordResetCompletedTemplate: TemplateConfig = {
	subject: () => buildResetCompletedSubject(),
	html: () => buildResetCompletedHtml(),
	text: () => buildResetCompletedText()
}
