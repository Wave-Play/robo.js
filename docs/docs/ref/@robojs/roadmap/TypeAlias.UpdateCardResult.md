# Type Alias: UpdateCardResult

```ts
type UpdateCardResult: object;
```

Result of a card update operation.

## Type declaration

### card

```ts
readonly card: RoadmapCard;
```

The updated card with full details populated by the provider.
On failure, this may contain partial data based on the input for debugging purposes.

### message?

```ts
readonly optional message: string;
```

Optional message providing additional context about the update result.
Typically used for error messages when `success` is false.

### success

```ts
readonly success: boolean;
```

Whether the card update succeeded.

## Remarks

This interface standardizes the response from provider card update operations, allowing
consumers to handle both success and failure cases consistently.

On success, the `card` field contains the fully updated card as returned by the provider.
On failure, the `message` field provides details about what went wrong.
