# Type Alias: AuthEmailEvent

```ts
type AuthEmailEvent: 
  | "user:created"
  | "session:created"
  | "email:verification-requested"
  | "email:verified"
  | "password:reset-requested"
  | "password:reset-completed";
```

Events that can trigger custom email workflows.
