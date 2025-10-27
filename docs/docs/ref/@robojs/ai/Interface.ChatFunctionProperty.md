# Interface: ChatFunctionProperty

Schema fragment representing a property definition within [ChatFunctionParameters](Interface.ChatFunctionParameters.md).

## Properties

### description?

```ts
optional description: string;
```

Human-readable description exposed to the model.

***

### enum?

```ts
optional enum: (string | number | boolean)[];
```

Enumerated accepted values, if applicable.

***

### items?

```ts
optional items: ChatFunctionProperty;
```

Nested schema for array item validation.

***

### maximum?

```ts
optional maximum: number;
```

Maximum numeric value when `type` is numeric.

***

### minimum?

```ts
optional minimum: number;
```

Minimum numeric value when `type` is numeric.

***

### type

```ts
type: 
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "integer";
```

Primitive JSON schema type.
