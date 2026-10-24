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
  gible: defineSpecies('Gible', { mass: 20.5 }),
  gabite: defineSpecies('Gabite', { mass: 56 }),
  golett: defineSpecies('Golett', { mass: 92 }),
  golurk: defineSpecies('Golurk', { mass: 330 }),
  druddigon: defineSpecies('Druddigon', { mass: 139 }),
  flygon: defineSpecies('Flygon', { mass: 82 }),
  trapinch: defineSpecies('Trapinch', { mass: 15 }),
  vibrava: defineSpecies('Vibrava', { mass: 15.3 }),
  phantump: defineSpecies('Phantump', { mass: 7 }),
  trevenant: defineSpecies('Trevenant', { mass: 71 }),
  tauros: defineSpecies('Tauros', { mass: 88.4 }),
} satisfies Record<string, PokemonSpecies>;
