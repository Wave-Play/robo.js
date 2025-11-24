# Type Alias: MailAttachment

```ts
type MailAttachment: object;
```

Attachment payload supplied to a mailer when sending transactional emails.
Not every provider supports attachments—consult your mailer for limits.

## Type declaration

### content

```ts
content: Buffer | string;
```

File data, either as a Buffer or base64 string.

### contentType?

```ts
optional contentType: string;
```

MIME type for the attachment. Many providers infer this automatically.

### filename

```ts
filename: string;
```

Filename visible to recipients (e.g. `invoice.pdf`).

## Example

```ts
{ filename: 'receipt.pdf', content: pdfBuffer, contentType: 'application/pdf' }
```
