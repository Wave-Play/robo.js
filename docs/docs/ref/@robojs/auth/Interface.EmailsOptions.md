# Interface: EmailsOptions

Strongly-typed `emails` configuration used to wire custom mailers and templates.

## Properties

### from?

```ts
optional from: MailParty;
```

***

### mailer?

```ts
optional mailer: AuthMailer | () => AuthMailer | Promise<AuthMailer> | object;
```

***

### templates?

```ts
optional templates: Partial<Record<AuthEmailEvent, TemplateOverride>>;
```

***

### triggers?

```ts
optional triggers: Partial<Record<AuthEmailEvent, EmailBuilder | EmailBuilder[]>>;
```
