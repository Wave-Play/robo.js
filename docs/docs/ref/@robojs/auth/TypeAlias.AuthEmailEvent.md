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

- `"user:created"`: fired after a user signs up (email/password or first OAuth login)
- `"session:created"`: fired when a new session is established (new device/IP)
- `"email:verification-requested"`: fired when a verification link is issued
- `"email:verified"`: fired once a verification link is confirmed
- `"password:reset-requested"`: fired when a password reset link is issued
- `"password:reset-completed"`: fired after a successful password change

Default templates ship for every event except `"email:verified"`. Each event
can define custom templates and builders via [EmailsOptions](Interface.EmailsOptions.md).
