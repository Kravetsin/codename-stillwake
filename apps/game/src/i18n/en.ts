/** Player-facing text, by key. Refusal reasons use the sim's keys, `<moduleId>.<why>`. */
export const EN: Readonly<Record<string, string>> = {
  'grid.outOfBounds': 'Outside the ship',
  'grid.occupied': 'Something is already there',
  'grid.machineInTheWay': 'A machine is in the way',
  'grid.blocked': 'Something is in the way',
  'grid.noSuchMaterial': 'No such material',
  'grid.noSuchMachine': 'No such machine',
  'grid.noDoor': 'There is no door here',
  'grid.noValve': 'There is no valve here',
  'building.planned': 'Already planned',
  'building.nothingThere': 'Nothing to take apart',
  'building.noPlan': 'No plan here',

  'tool.wall': 'Wall',
  'tool.floor': 'Floor',
  'tool.ladder': 'Ladder',
  'tool.door': 'Door',
  'tool.pipe': 'Pipe',
  'tool.valve': 'Valve',
  'tool.tank': 'Tank',
  'tool.vent': 'Vent',
  'tool.deconstruct': 'Deconstruct',
  'tool.cancel': 'Cancel plans',
  'tool.hint': 'Drag to lay a line · click the tool again or press Esc to put it away',
  'material.scrap': 'scrap',
  'material.steel': 'steel',
  'item.canister': 'canisters',
  'stock.notEnough': 'Not enough in stock',
  'atmosphere.noTank': 'There is no tank here',
  'atmosphere.tankFull': 'The tank is full',
  'stock.creative': 'creative',
  'crew.suit': 'suit',
  'crew.passedOut': 'Passed out: no air',
  'hazards.noWall': 'There is no wall here',
};

/** The text for `key`, or the key itself while it has none. */
export function t(key: string): string {
  return EN[key] ?? key;
}
