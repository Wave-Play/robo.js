# Type Alias: AuthPluginOptions

```ts
type AuthPluginOptions: Omit<z.infer<typeof authPluginOptionsSchema>, "emails"> & object;
```

Convenience type mirroring the schema with improved autocomplete for the `emails` block.

## Type declaration

### emails?

```ts
optional emails: EmailsOptions;
```
