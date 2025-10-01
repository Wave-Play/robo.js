# Interface: SeedHookConfig

## Properties

### description?

```ts
optional description: string;
```

Short description of what seeding provides.

***

### env?

```ts
optional env: SeedEnvConfig;
```

Environment variable seeding options for this plugin/project.

***

### hook?

```ts
optional hook: SeedHookHandler;
```

Custom seeding logic executed prior to file generation.
