# Type Alias: MailParty

```ts
type MailParty: string | object;
```

Represents an email party (sender or recipient). Accepts either a bare email
string or a structured `{ name, address }` object (name optional) for
readable headers such as `"Robo.js <noreply@example.com>"`.

## Examples

```ts
'admin@example.com'
```

```ts
{ name: 'Robo.js', address: 'noreply@example.com' }
```

```ts
{ address: 'support@example.com' }
```
