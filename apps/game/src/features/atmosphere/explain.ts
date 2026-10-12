import { AIR, CREW } from '@stillwake/content';
import { TICKS_PER_SECOND, type RoomAir } from '@stillwake/sim';
import { t } from '../../i18n/en';

/** `ticks` as a player reads a span: seconds under a minute, whole minutes past it. */
export function span(ticks: number): string {
  const seconds = Math.ceil(ticks / TICKS_PER_SECOND);
  return seconds < 60
    ? t('time.seconds', { n: seconds })
    : t('time.minutes', { n: Math.floor(seconds / 60) });
}

/** What `breathers` heroes breathe a minute, a breath a unit. */
const breathing = (breathers: number) => (breathers * AIR.leakEvery) / CREW.breathEvery;

/**
 * How long `units` of oxygen last a room leaking `leak` a minute with `breathers` heroes breathing in
 * it, a breath a unit; `∞` when nothing draws. A forecast for the player, not a rule: a suit's refill
 * and other rooms on the same pipes are left out.
 */
function lasting(units: number, leak: number, breathers: number): string {
  const perMinute = leak + breathing(breathers);
  return perMinute > 0 ? span(Math.floor((units * AIR.leakEvery) / perMinute)) : '∞';
}

/**
 * Whether a room's generators keep up with its leak and its breathers, and by how much a minute; or,
 * falling short, how long its air and their stores last the difference.
 */
function generated(air: RoomAir, breathers: number): string {
  const spare = air.made - air.leak - breathing(breathers);
  return spare >= 0
    ? t('air.keepsUp', { n: Math.floor(spare) })
    : t('air.fallsShort', { time: lasting(air.oxygen + air.aired, -spare, 0) });
}

/**
 * What the air overlay says of a room of `volume` cells with `breathers` heroes awake in it, in two
 * short lines and a third only for what it lacks: its state, then what holds it up and how long, the
 * hull's leak and the breathing counted in. Only what the sim reported, and a forecast from it.
 */
export function explain(air: RoomAir, volume: number, breathers = 0): string[] {
  const { oxygen, leak } = air;
  // With no supply, the room lives on its own air.
  const lasts =
    air.made > 0
      ? generated(air, breathers)
      : oxygen > 0
        ? t('air.lasts', { oxygen, time: lasting(oxygen, leak, breathers) })
        : t('air.lastsNot', { time: lasting(air.aired, leak, breathers) });
  switch (air.status) {
    case 'aired':
      return [t('air.aired', { cells: volume }), lasts];
    case 'filling':
      return [
        t('air.filling', { aired: air.aired, cells: volume }),
        air.made > 0 ? lasts : t('air.pipes', { oxygen }),
      ];
    case 'venting':
      // With no piped vent in it, nothing drains: there are no pipes to speak of.
      return [
        t('air.venting'),
        ...(air.lasts === undefined ? [] : [t('air.drains', { oxygen, time: span(air.lasts) })]),
      ];
    case 'vacuum':
      return air.aired > 0
        ? [
            t('air.holding', { aired: air.aired, cells: volume }),
            lasts,
            ...(air.problem ? [t(air.problem)] : []),
          ]
        : [t('air.vacuum', { cells: volume }), ...(air.problem ? [t(air.problem)] : [])];
  }
}
