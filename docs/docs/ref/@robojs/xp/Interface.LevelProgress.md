# Interface: LevelProgress

Level progress information from computeLevelFromTotalXp

## Example

```ts
For 200 total XP (level 1 starts at 155, level 2 starts at 375):
{
  level: 1,
  inLevel: 45,  // 200 - 155
  toNext: 175   // 220 - 45
}
```

## Properties

### inLevel

```ts
inLevel: number;
```

XP accumulated within current level (0 to xpNeededForLevel(level+1))

***

### level

```ts
level: number;
```

Current level (0-based)

***

### toNext

```ts
toNext: number;
```

XP still needed to reach next level
