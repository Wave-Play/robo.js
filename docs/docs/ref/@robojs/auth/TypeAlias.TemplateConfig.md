# Type Alias: TemplateConfig

```ts
type TemplateConfig: object | object;
```

Describes how automated emails are rendered or composed—either via inline
content (subject/html/text/React) or a provider-managed template id.

- Inline mode: supply `subject` plus `html`, `text`, and/or `react`
- Provider mode: supply `templateId` plus optional `variables`

## Examples

```ts
{ subject: ctx => `Welcome ${ctx.user.name}`, react: WelcomeEmail }
```

```ts
{ templateId: 'd-reset', variables: ctx => ({ link: ctx.links?.resetPassword }) }
```
