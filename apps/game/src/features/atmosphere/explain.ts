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

/**
 * How long `units` of oxygen last a room leaking `leak` a minute with `breathers` heroes breathing in
 * it, a breath a unit; `∞` when nothing draws. A forecast for the player, not a rule: a suit's refill
 * and other rooms on the same pipes are left out.
 */
function lasting(units: number, leak: number, breathers: number): string {
  const perMinute = leak + (breathers * AIR.leakEvery) / CREW.breathEvery;
  return perMinute > 0 ? span(Math.floor((units * AIR.leakEvery) / perMinute)) : '∞';
}

/**
 * What the air overlay says of a room of `volume` cells with `breathers` heroes awake in it: its
 * state, then why — what it leaks, what holds it up and for how long, or what it lacks. Only what
 * the sim reported, and a forecast from it.
 */
export function explain(air: RoomAir, volume: number, breathers = 0): string[] {
  const { oxygen, leak } = air;
  const leaks = t('air.leak', { leak, time: span(AIR.leakEvery) });
  // With no supply, the room lives on its own air.
  const lasts =
    oxygen > 0
      ? t('air.lasts', { oxygen, time: lasting(oxygen, leak, breathers) })
      : t('air.lastsNot', { time: lasting(air.aired, leak, breathers) });
  switch (air.status) {
    case 'aired':
      return [t('air.aired', { cells: volume }), leaks, lasts];
    case 'filling':
      return [t('air.filling', { aired: air.aired, cells: volume }), t('air.holds', { oxygen })];
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
            leaks,
            lasts,
            ...(air.problem ? [t(air.problem)] : []),
          ]
        : [t('air.vacuum', { cells: volume }), ...(air.problem ? [t(air.problem)] : [])];
  }
}
