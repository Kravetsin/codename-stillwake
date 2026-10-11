import { AIR } from '@stillwake/content';
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
 * What the air overlay says of a room of `volume` cells: its state, then why — what it leaks, what
 * holds it up and for how long, or what it lacks. Only what the sim reported; no rule of its own.
 */
export function explain(air: RoomAir, volume: number): string[] {
  const oxygen = air.oxygen;
  switch (air.status) {
    case 'aired':
      return [
        t('air.aired', { cells: volume }),
        t('air.leak', { leak: air.leak, time: span(AIR.leakEvery) }),
        air.lasts === undefined || air.lasts > 0
          ? t('air.lasts', { oxygen, time: air.lasts === undefined ? '∞' : span(air.lasts) })
          : t('air.lastsNot', { oxygen }),
      ];
    case 'filling':
      return [t('air.filling', { aired: air.aired, cells: volume }), t('air.holds', { oxygen })];
    case 'venting':
      // With no piped vent in it, nothing drains: there are no pipes to speak of.
      return [
        t('air.venting'),
        ...(air.lasts === undefined ? [] : [t('air.drains', { oxygen, time: span(air.lasts) })]),
      ];
    case 'vacuum':
      return [t('air.vacuum', { cells: volume }), ...(air.problem ? [t(air.problem)] : [])];
  }
}
