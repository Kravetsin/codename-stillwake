import type { RoomAir } from '@stillwake/sim';
import { t } from '../../i18n/en';
import type { Alert } from '../feature';

/**
 * The air dangers among `rooms`, each counted over all rooms: a piped vent draining into space, pipes
 * that cannot pay a room's next leak, vents on pipes with no oxygen. A room open to space with no
 * piped vent costs nothing, so it raises nothing: the start's breached room stays quiet.
 */
export function airAlerts(rooms: readonly RoomAir[]): Alert[] {
  const count = (holds: (r: RoomAir) => boolean) => rooms.filter(holds).length;
  const alerts: [id: string, n: number][] = [
    ['air.venting', count((r) => r.status === 'venting' && r.lasts !== undefined)],
    ['air.runningOut', count((r) => r.status === 'aired' && r.lasts === 0)],
    ['air.dry', count((r) => r.problem === 'atmosphere.dry')],
  ];
  return alerts.flatMap(([id, n]) => (n > 0 ? [{ id, text: t(`alert.${id}`, { n }) }] : []));
}
