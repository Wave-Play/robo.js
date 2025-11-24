# Interface: EmailsOptions

Email system configuration controlling sender identity, mailer wiring,
template overrides, and event-driven triggers.

## Remarks

Mirrors the shape validated by emailsSchema. For practical
integration examples (Resend, React Email, template disabling) see
`packages/@robojs/auth/README.md`.

## Properties

### from?

```ts
optional from: MailParty;
```

Default sender for all automated emails (string or `{ name, address }`).
Individual builders/templates can override `from` per message.

#### Examples

```ts
'noreply@example.com'
```

```ts
{ name: 'Robo.js', address: 'bot@example.com' }
```

#### See

MailParty

***

### mailer?

```ts
optional mailer: AuthMailer | () => AuthMailer | Promise<AuthMailer> | object;
```

Mailer reference used to deliver messages.

Supports:
1. Direct [AuthMailer](Interface.AuthMailer.md) instance (e.g. `createResendMailer({ apiKey, from })`)
2. Lazy factory returning a mailer (sync or async) for deferred imports
3. Module spec `{ module: string, export?: string }` resolved at runtime

When using `{ module, export? }`, the resolved export must implement `AuthMailer`, 
not a raw SDK class.

⚠️ If the mailer implements `verify()`, it is called during startup to
catch misconfiguration early. When omitted entirely, the system logs and
skips email delivery instead of crashing.

#### Examples

```ts
ResendMailer({ apiKey: process.env.RESEND_API_KEY!, from: 'bot@example.com' })
```

```ts
() => createResendMailer({ apiKey: process.env.RESEND_API_KEY!, from: 'bot@example.com' })
```

```ts
{ module: './my-mailer.js' }
```

***

### templates?

```ts
optional templates: Partial<Record<AuthEmailEvent, TemplateOverride>>;
```

Per-event template overrides or `false` to suppress an event entirely.

Supports inline subject/html/text values, React renderers (via
`@react-email/components`), provider templates via `templateId`, and
selective field overrides merged with the defaults.

Events: 'user:created', 'session:created',
'email:verification-requested', 'email:verified',
'password:reset-requested', 'password:reset-completed'.

#### Examples

```ts
{ 'user:created': { subject: 'Welcome', text: ctx => `Hi ${ctx.user.email}` } }
```

```ts
{ 'password:reset-requested': { subject: 'Reset Password', react: ctx => <ResetEmail {...ctx} /> } }
```

```ts
{ 'session:created': false }
```

#### See

TemplateOverride

***

### triggers?

```ts
optional triggers: Partial<Record<AuthEmailEvent, EmailBuilder | EmailBuilder[]>>;
```

Custom builders executed when specific email events fire. Accepts a single
builder or an array executed sequentially. Return `null` to skip sending
(useful for conditional logic or audit-only hooks).

Builders run before template rendering and receive the full
[EmailContext](TypeAlias.EmailContext.md) (user, session, links, tokens, etc.).

#### Example

```ts
{
	 *   'password:reset-requested': [auditLogBuilder, smsAlertBuilder]
	 * }
```

#### See

EmailBuilder
