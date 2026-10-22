# Pokémon Sprites — Phaser Reference

Copied from DungeonClicker (`public/assets`). Credits for the sprite artists are in
`public/assets/Pokemon Models/credit_names.txt` (PMD SpriteCollab).

## Files

| Path | Contents |
| --- | --- |
| `public/assets/Pokemon Models/<Name>.png` + `.json` | Per-species animated sprite sheet + frame atlas |
| `public/assets/Pokemon Icons/<Name>Icon.png` | Individual menu icons |
| `public/assets/pokemon-icons.png` + `.json` | All icons packed into one atlas (frame name = icon name) |
| `src/data/pokemonAssetManifest.json` | Lists of available model and icon names |

## Frame names

```
<Variant>/<State>/Anim/<Direction>/<Frame>
e.g. Normal/Walk/Anim/2/0003
```

- **Variant:** `Normal` or `Shiny`
- **State:** `Idle`, `Walk`, `Attack`, `Hurt`, `Sleep`, `Hop`, `Pose`, `Shock`, `Eat`, ... (varies per species)
- **Frame:** zero-padded index, `0000`, `0001`, ...

## Directions

| Index | Facing |
| --- | --- |
| 0 | Down |
| 1 | Down-right |
| 2 | Right |
| 3 | Up-right |
| 4 | Up |
| 5 | Up-left |
| 6 | Left |
| 7 | Down-left |

Velocity → direction (screen coordinates, +y is down):

```ts
export type PokemonDirection = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export function getDirectionFromVector(x: number, y: number): PokemonDirection {
  const angle = Math.atan2(y, x);
  const octant = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
  const directionByOctant: PokemonDirection[] = [2, 1, 0, 7, 6, 5, 4, 3];

  return directionByOctant[octant];
}
```

## Loading in Phaser

The `.json` files use a `{ textures: [...] }` layout, so DungeonClicker loads the PNG and JSON
separately and attaches the frames after loading:

```ts
// preload()
this.load.image('pokemon-pikachu', 'assets/Pokemon Models/Pikachu.png');
this.load.json('pokemon-pikachu-atlas', 'assets/Pokemon Models/Pikachu.json');
this.load.atlas('pokemon-icons', 'assets/pokemon-icons.png', 'assets/pokemon-icons.json');

// create()
const texture = this.textures.get('pokemon-pikachu');
const atlasData = this.cache.json.get('pokemon-pikachu-atlas');
if (texture.frameTotal <= 1) {
  this.textures.addAtlasJSONArray('pokemon-pikachu', texture, atlasData);
}
```

One animation per variant/state/direction:

```ts
function createAnimation(scene: Phaser.Scene, textureKey: string, state: string, direction: number, frameRate: number) {
  const prefix = `Normal/${state}/Anim/${direction}/`;
  const frames = scene.textures
    .get(textureKey)
    .getFrameNames()
    .filter((name) => name.startsWith(prefix))
    .sort();

  if (frames.length === 0) return;

  scene.anims.create({
    key: `${textureKey}-${state}-${direction}`,
    frames: frames.map((frame) => ({ key: textureKey, frame })),
    frameRate,
    repeat: -1,
  });
}
```

DungeonClicker defaults: `Idle` at 4 fps, `Walk` at 8 fps, `Sleep` at 2 fps, render scale 1.8.
