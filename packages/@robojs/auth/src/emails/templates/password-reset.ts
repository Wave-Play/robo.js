import type { EmailContext, TemplateConfig } from '../types.js'

/** Subject used when prompting a user to reset their password. */
function buildResetRequestSubject(): string {
	return 'Reset your password'
}

/** HTML body encouraging a user to choose a new password. */
function buildResetRequestHtml(ctx: EmailContext): string {
	const title = 'Reset your password'
	const resetLink = ctx.links?.resetPassword ?? null
	const button = resetLink
		? `<p style="margin:24px 0"><a href="${resetLink}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#6366f1;color:#fff;font-weight:600;text-decoration:none">Choose a new password</a></p>`
		: ''
	const fallback = resetLink
		? `<p style="font-size:13px;color:#6b7280">If the button does not work, copy and paste this link into your browser:<br /><a href="${resetLink}" style="color:#6366f1;text-decoration:underline">${resetLink}</a></p>`
		: ''
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
      p { margin:0 0 16px; color:#333; line-height:1.6; }
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
        <p>We received a request to reset the password for your account. Click the button below to continue.</p>
        ${button}
        <p>If you did not request this change, you can ignore this email.</p>
        ${fallback}
      </div>
    </div>
  </body>
</html>`
}

/** Plain-text variant for the password reset request email. */
function buildResetRequestText(ctx: EmailContext): string {
	const link = ctx.links?.resetPassword ?? ''
	const lines = [
		'We received a request to reset the password for your account.',
		link ? `Reset your password: ${link}` : undefined,
		'',
		'If you did not request this change, you can ignore this email.'
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
	return 'Your password was changed'
}

/** HTML copy used for password reset completion emails. */
function buildResetCompletedHtml(): string {
	const title = 'Your password was changed'
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
      p { margin:0 0 16px; color:#333; line-height:1.6; }
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
        <p>Your password was just changed. If this was you, you do not need to take any further action.</p>
        <p>If you did not make this change, please reset your password again or contact support immediately.</p>
      </div>
    </div>
  </body>
</html>`
}

/** Plain-text fallback for password reset completion notifications. */
function buildResetCompletedText(): string {
	return [
		'Your password was just changed.',
		'',
		'If this was not you, please reset your password again or contact support immediately.'
	].join('\n')
}

/** Template pack acknowledging password reset completion. */
export const DefaultPasswordResetCompletedTemplate: TemplateConfig = {
	subject: () => buildResetCompletedSubject(),
	html: () => buildResetCompletedHtml(),
	text: () => buildResetCompletedText()
}
