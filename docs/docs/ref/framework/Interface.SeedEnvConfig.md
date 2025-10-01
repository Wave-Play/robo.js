# Interface: SeedEnvConfig

## Properties

### description?

```ts
optional description: string;
```

Summary displayed before prompting for environment values.

***

### variables?

```ts
optional variables: Record<string, string | SeedEnvVariableConfig>;
```

Map of variables to seed into detected env files.
