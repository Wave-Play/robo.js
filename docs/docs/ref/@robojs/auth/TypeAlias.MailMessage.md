# Type Alias: MailMessage

```ts
type MailMessage: object;
```

Message contract understood by mail adapters and builders.

## Type declaration

### attachments?

```ts
optional attachments: MailAttachment[];
```

### from?

```ts
optional from: MailParty;
```

### headers?

```ts
optional headers: Record<string, string>;
```

### html?

```ts
optional html: string;
```

### subject

```ts
subject: string;
```

### tags?

```ts
optional tags: string[];
```

### templateId?

```ts
optional templateId: string;
```

### text?

```ts
optional text: string;
```

### to

```ts
to: MailParty;
```

### variables?

```ts
optional variables: Record<string, unknown>;
```
