import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { SvgIcon, type IconName } from './SvgIcon';

export type { IconName };

// On iPhone, Apple's SF Symbols: the filled versions, as in the original
// mockups. Lines (close, check, chevrons…) have no fill, so they get a heavier weight.
const SYMBOLS: Record<IconName, { name: SymbolViewProps['name']; weight?: SymbolViewProps['weight'] }> = {
  close: { name: 'xmark', weight: 'semibold' },
  back: { name: 'chevron.left', weight: 'semibold' },
  phone: { name: 'phone.fill' },
  message: { name: 'message.fill' },
  navigate: { name: 'location.fill' },
  clock: { name: 'clock.fill' },
  person: { name: 'person.fill' },
  notes: { name: 'note.text' },
  pin: { name: 'mappin.circle.fill' },
  check: { name: 'checkmark', weight: 'semibold' },
  plus: { name: 'plus', weight: 'semibold' },
  skip: { name: 'forward.end.fill' },
  route: { name: 'point.topleft.down.to.point.bottomright.curvepath.fill' },
  alert: { name: 'exclamationmark.triangle.fill' },
  search: { name: 'magnifyingglass', weight: 'semibold' },
  flag: { name: 'flag.fill' },
  edit: { name: 'pencil', weight: 'semibold' },
  chevronDown: { name: 'chevron.down', weight: 'semibold' },
  lines: { name: 'text.alignleft', weight: 'semibold' },
  lock: { name: 'lock.fill' },
  trash: { name: 'trash.fill' },
  more: { name: 'ellipsis', weight: 'bold' },
};

export function Icon({ name, size = 20, color = '#1A1A1A', strokeWidth }: {
  name: IconName; size?: number; color?: string; strokeWidth?: number;
}) {
  const s = SYMBOLS[name];
  return (
    <SymbolView name={s.name} weight={s.weight} size={size} tintColor={color} type="monochrome"
      style={{ width: size, height: size }}
      fallback={<SvgIcon name={name} size={size} color={color} strokeWidth={strokeWidth} />} />
  );
}
