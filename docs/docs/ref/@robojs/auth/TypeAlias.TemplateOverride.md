# Type Alias: TemplateOverride

```ts
type TemplateOverride: TemplateConfig | false;
```

User-supplied override merged with the default template. Provide only the
fields you want to change; the remaining defaults stay intact. Set to `false`
to disable an event's email entirely without affecting other events.
