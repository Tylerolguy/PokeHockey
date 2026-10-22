import Phaser from 'phaser';

/** Sprite sheet directions: 0 = down, then clockwise to 7 = down-left. See docs/SPRITES.md. */
export type PokemonDirection = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type PokemonAnimationState = 'Idle' | 'Walk';

const FRAME_RATES: Record<PokemonAnimationState, number> = {
  Idle: 4,
  Walk: 10,
};

export function getPokemonTextureKey(modelName: string): string {
  return `pokemon-${modelName.toLowerCase()}`;
}

export function loadPokemonModel(scene: Phaser.Scene, modelName: string): void {
  scene.load.atlas(
    getPokemonTextureKey(modelName),
    `assets/Pokemon Models/${modelName}.png`,
    `assets/Pokemon Models/${modelName}.json`,
  );
}

export function getPokemonAnimationKey(modelName: string, state: PokemonAnimationState, direction: PokemonDirection): string {
  return `${getPokemonTextureKey(modelName)}-${state}-${direction}`;
}

/** Creates Idle/Walk animations for all 8 directions. Call in create(), after the atlas loaded. */
export function createPokemonAnimations(scene: Phaser.Scene, modelName: string): void {
  const textureKey = getPokemonTextureKey(modelName);
  const frameNames = scene.textures.get(textureKey).getFrameNames();

  for (const state of Object.keys(FRAME_RATES) as PokemonAnimationState[]) {
    for (let direction = 0; direction < 8; direction++) {
      const key = getPokemonAnimationKey(modelName, state, direction as PokemonDirection);
      const prefix = `Normal/${state}/Anim/${direction}/`;
      const frames = frameNames.filter((name) => name.startsWith(prefix)).sort();

      if (frames.length === 0 || scene.anims.exists(key)) {
        continue;
      }

      scene.anims.create({
        key,
        frames: frames.map((frame) => ({ key: textureKey, frame })),
        frameRate: FRAME_RATES[state],
        repeat: -1,
      });
    }
  }
}

/** Screen-space vector (+y down) to the nearest of the 8 sprite directions. */
export function getDirectionFromVector(x: number, y: number): PokemonDirection {
  const octant = (Math.round(Math.atan2(y, x) / (Math.PI / 4)) + 8) % 8;
  const directionByOctant: PokemonDirection[] = [2, 1, 0, 7, 6, 5, 4, 3];

  return directionByOctant[octant];
}
