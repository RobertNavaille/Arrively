import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { setLocked } from '../lib/locks';
import type { Stop } from '../lib/types';
import { RowMenu, type RowMenuItem } from './RowMenu';

/**
 * A stop's row in the Schedule and trip lists: tap for `onPress`; press and
 * hold for Edit stop and (for a stop not yet started) Lock / Unlock. A locked
 * stop keeps its day when the week is optimized and its place when the route is.
 */
export function StopMenu({ stop, day, locked, onPress, children }: {
  stop: Stop; day: string; locked: boolean; onPress: () => void; children: ReactNode;
}) {
  const router = useRouter();
  const canLock = stop.status === 'scheduled' || stop.status === 'queued';
  const items: RowMenuItem[] = [
    { label: 'Edit stop', icon: 'edit', sfSymbol: 'pencil', onPress: () => router.push({ pathname: '/new-stop', params: { id: stop.id, day } }) },
    ...(canLock || locked ? [{ label: locked ? 'Unlock' : 'Lock in place', icon: 'lock' as const, sfSymbol: locked ? 'lock.open' : 'lock', onPress: () => setLocked(stop.id, !locked) }] : []),
  ];
  return (
    <RowMenu items={items} onPress={onPress} label={`${stop.customer_name}, ${stop.address.split(',')[0]}${locked ? ', locked' : ''}`}>
      {children}
    </RowMenu>
  );
}
