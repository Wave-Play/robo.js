# Type Alias: MailMessage

```ts
type MailMessage: object;
```

Message contract understood by mail adapters and builders. Includes support
for inline HTML/text or provider-managed templates via `templateId`.

## Type declaration

### attachments?

```ts
optional attachments: MailAttachment[];
```

Attachments appended to the message.

### from?

```ts
optional from: MailParty;
```

Optional sender override (falls back to `emails.from`).

### headers?

```ts
optional headers: Record<string, string>;
```

Custom headers such as `X-Priority`.

### html?

```ts
optional html: string;
```

Rich HTML body; ignored when `templateId` is provided.

### subject

```ts
subject: string;
```

Subject line, required for inline templates.

### tags?

```ts
optional tags: string[];
```

Tracking tags supported by providers like Resend or Postmark.

### templateId?

```ts
optional templateId: string;
```

Provider template identifier (SendGrid dynamic templates, Postmark, etc.).

### text?

```ts
optional text: string;
```

Plain-text fallback body.

### to

```ts
to: MailParty;
```

Recipient address.

### variables?

```ts
optional variables: Record<string, unknown>;
```

Variables consumed by provider templates.

## Examples

```ts
{ to: user.email!, subject: 'Welcome', html: '<p>Hello!</p>', text: 'Hello!' }
```

```ts
{
  to: user.email!,
  subject: '',
  templateId: 'd-reset',
  variables: { userName: user.name, link: ctx.links?.resetPassword }
}
```

```ts
{
  to: user.email!,
  subject: 'Invoice',
  html: '<p>Attached invoice</p>',
  attachments: [{ filename: 'invoice.pdf', content: pdfBuffer }]
}
```
