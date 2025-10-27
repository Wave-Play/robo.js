# Type Alias: CreateCardResult

```ts
type CreateCardResult: object;
```

Result of a card creation operation.

## Type declaration

### card

```ts
readonly card: RoadmapCard;
```

The created card with full details populated by the provider.
On failure, this may contain partial data based on the input for debugging purposes.

### message?

```ts
readonly optional message: string;
```

Optional message providing additional context about the creation result.
Typically used for error messages when `success` is false.

### success

```ts
readonly success: boolean;
```

Whether the card creation succeeded.

## Remarks

This interface standardizes the response from provider card creation operations, allowing
consumers to handle both success and failure cases consistently.

On success, the `card` field contains the fully populated card as returned by the provider.
On failure, the `message` field provides details about what went wrong.
