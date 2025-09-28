import type { TemplateConfig } from '../types.js'

const baseStyles = [
  "font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif",
  "background:#0b0d12",
  "color:#e5e7eb",
  "padding:32px"
].join(';')

const cardStyles = [
  "max-width:560px",
  "margin:0 auto",
  "background:#131722",
  "border-radius:12px",
  "padding:24px",
  "box-shadow:0 10px 30px rgba(15,23,42,0.35)",
  "line-height:1.6"
].join(';')

/** Default template for verification emails triggered by Auth.js flows. */
export const DefaultEmailVerificationTemplate: TemplateConfig = {
  subject: () => 'Confirm your email address',
  html: (ctx) => {
    const link = ctx.links?.verifyEmail ?? ctx.tokens?.verifyEmail ?? '#'
    return `<!doctype html>
<html>
  <body style="${baseStyles}">
    <table role="presentation" style="width:100%;border-collapse:collapse;">
      <tr>
        <td>
          <div style="${cardStyles}">
            <h1 style="margin-top:0;color:#fff;font-size:22px">Verify your email</h1>
            <p>Hello${ctx.user.name ? ` ${ctx.user.name}` : ''},</p>
            <p>Confirm your email to finish signing in to Robo.</p>
            <p style="margin:24px 0">
              <a href="${link}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#6366f1;color:#fff;text-decoration:none;font-weight:600">Verify email</a>
            </p>
            <p style="color:#9ca3af;font-size:14px">If the button doesn’t work, copy and paste this link:
              <br /><span style="color:#cbd5f5">${link}</span>
            </p>
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`
  },
  text: (ctx) => {
    const link = ctx.links?.verifyEmail ?? ctx.tokens?.verifyEmail ?? ''
    return [
      'Verify your email to finish signing in to Robo.',
      '',
      link ? `Verification link: ${link}` : undefined,
      '',
      'If you did not request this email, you can ignore it.'
    ]
      .filter(Boolean)
      .join('\n')
  }
}
