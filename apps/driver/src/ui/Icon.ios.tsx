import { SymbolView } from 'expo-symbols';
import { SvgIcon, type IconName } from './SvgIcon';
import { SF_SYMBOLS as SYMBOLS } from './sfSymbols';

export type { IconName };


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
