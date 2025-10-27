# Interface: ChatFunctionParameters

JSON schema snippet describing function parameters accepted by a chat tool.

## Properties

### properties

```ts
properties: Record<string, ChatFunctionProperty>;
```

Dictionary of property names to schema definitions.

***

### required?

```ts
optional required: string[];
```

Required property names that must be supplied.

***

### type?

```ts
optional type: "object" | "array";
```

Top-level schema type, defaults to `object`.
