import { DEFAULT_SKATER_TUNING, type SkaterTuning } from '../sim/Skater';

/** Per-species data: which sprite to draw and how the species skates. */
export interface PokemonSpecies {
  /** Name of the sprite sheet in public/assets/Pokemon Models. */
  model: string;
  tuning: SkaterTuning;
}

function defineSpecies(model: string, overrides: Partial<SkaterTuning>): PokemonSpecies {
  return { model, tuning: { ...DEFAULT_SKATER_TUNING, ...overrides } };
}

/** Masses are Pokédex weights in kg. */
export const POKEMON_SPECIES = {
  garchomp: defineSpecies('Garchomp', { mass: 95 }),
  flygon: defineSpecies('Flygon', { mass: 82 }),
} satisfies Record<string, PokemonSpecies>;
