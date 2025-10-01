import type { EmailContext, TemplateConfig } from '../types.js'

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
	'box-shadow:0 26px 60px rgba(8,24,68,0.45)',
	'line-height:1.6'
].join(';')

function wrapEmail(title: string, cardContent: string): string {
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
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${link}" style="height:50px;v-text-anchor:middle;width:280px;" arcsize="15%" stroke="t" strokecolor="#60a5fa" fillcolor="${BUTTON_PRIMARY_FROM}" alt="${label}">
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

function buildResetRequestSubject(ctx: EmailContext): string {
	const { appName } = ctx
	return `Reset your ${appName} password`
}

/** HTML body encouraging a user to choose a new password. */
function buildResetRequestHtml(ctx: EmailContext): string {
	const { appName } = ctx
	const title = `Reset your ${appName} password`
	const resetLink = ctx.links?.resetPassword ?? null
	const fallback = resetLink
		? `<p style="margin:0;color:#e2e8f0;font-size:13px;word-break:break-all;">${resetLink}</p>`
		: ''
	const cardContent = `
    <h1 style="margin:24px 0 12px;font-size:28px;color:#f8fafc;">Reset your <strong>${appName}</strong> password</h1>
		<p style="margin:0 0 12px;color:#d8e2ff;font-size:16px;">We received a request to reset your <strong>${appName}</strong> password. Use the secure link below to continue.</p>
		<p style="margin:0 0 20px;color:#d2dcff;font-size:15px;">The link expires soon to keep your <strong>${appName}</strong> account protected.</p>
    ${buildPrimaryButton(resetLink ?? '', 'Choose a new password')}
    <table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 24px;">
      <tr>
	        <td style="padding:18px 20px;background:rgba(15,23,42,0.6);border:1px solid rgba(56,189,248,0.18);">
          <p style="margin:0 0 6px;color:#38bdf8;font-size:13px;font-weight:600;">Can’t access the button?</p>
          <p style="margin:0;color:#e2e8f0;font-size:14px;">Copy and paste the recovery link instead.</p>
        </td>
      </tr>
    </table>
    ${fallback}
		<p style="margin:28px 0 0;color:#dbe3ff;font-size:12px;text-align:center;">If you didn’t ask for this, you can safely ignore the message and your <strong>${appName}</strong> access stays secure.</p>
		<p style="margin:16px 0 0;color:#d0d9ff;font-size:11px;text-align:center;">Powered by <a href="https://robojs.dev" style="color:#d4dcff;text-decoration:underline;"><strong>Robo.js</strong></a></p>
  `
	return wrapEmail(title, cardContent)
}

/** Plain-text variant for the password reset request email. */
function buildResetRequestText(ctx: EmailContext): string {
	const { appName } = ctx
	const link = ctx.links?.resetPassword ?? ''
	const lines = [
		`We received a request to reset the password for your **${appName}** account.`,
		link ? `Use this secure link to choose a new password: ${link}` : undefined,
		'',
		`If you did not request this change, you can ignore this email and your **${appName}** access remains unchanged.`,
		'',
		'Powered by **Robo.js** (https://robojs.dev)'
	].filter(Boolean)
	return lines.join('\n')
}

/** Template bundle powering password reset request notifications. */
export const DefaultPasswordResetRequestTemplate: TemplateConfig = {
	subject: (ctx) => buildResetRequestSubject(ctx),
	html: (ctx) => buildResetRequestHtml(ctx),
	text: (ctx) => buildResetRequestText(ctx)
}

/** Subject sent once a user successfully changes their password. */
function buildResetCompletedSubject(ctx: EmailContext): string {
	const { appName } = ctx
	return `Your ${appName} password was changed`
}

/** HTML copy used for password reset completion emails. */
function buildResetCompletedHtml(ctx: EmailContext): string {
	const { appName } = ctx
	const title = `Your ${appName} password was changed`
	const cardContent = `
    <h1 style="margin:24px 0 12px;font-size:28px;color:#f8fafc;">Your <strong>${appName}</strong> password was changed</h1>
    <p style="margin:0 0 12px;color:#d8e2ff;font-size:16px;">Your <strong>${appName}</strong> password was updated successfully.</p>
    <p style="margin:0 0 18px;color:#d2dcff;font-size:15px;">If this update looks unfamiliar, reset the password again and review your active sessions.</p>
    <table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 24px;">
      <tr>
	        <td style="padding:18px 20px;background:rgba(15,23,42,0.6);border:1px solid rgba(56,189,248,0.18);">
          <p style="margin:0 0 6px;color:#38bdf8;font-size:13px;font-weight:600;">Next steps</p>
          <p style="margin:0;color:#e2e8f0;font-size:14px;">Review devices, enable two-factor authentication, and keep your recovery codes handy.</p>
        </td>
      </tr>
    </table>
    <p style="margin:28px 0 0;color:#dbe3ff;font-size:12px;text-align:center;">Need support? Reply to this email and our team will help keep your <strong>${appName}</strong> account secure.</p>
    <p style="margin:16px 0 0;color:#d0d9ff;font-size:11px;text-align:center;">Powered by <a href="https://robojs.dev" style="color:#d4dcff;text-decoration:underline;"><strong>Robo.js</strong></a></p>
  `
	return wrapEmail(title, cardContent)
}

/** Plain-text fallback for password reset completion notifications. */
function buildResetCompletedText(ctx: EmailContext): string {
	const { appName } = ctx
	return [
		`Your **${appName}** password was just changed.`,
		'',
		'If this was not you, reset your password again and review your active sessions.',
		'',
		'Powered by **Robo.js** (https://robojs.dev)'
].join('\n')
}

/** Template pack acknowledging password reset completion. */
export const DefaultPasswordResetCompletedTemplate: TemplateConfig = {
	subject: (ctx) => buildResetCompletedSubject(ctx),
	html: (ctx) => buildResetCompletedHtml(ctx),
	text: (ctx) => buildResetCompletedText(ctx)
}
