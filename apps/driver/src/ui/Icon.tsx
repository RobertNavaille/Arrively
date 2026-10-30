import Svg, { Circle, Path } from 'react-native-svg';

// Arrively's thin line icons (same drawings as the design system's Icon).
const PATHS = {
  close: ['M6 6l12 12', 'M18 6L6 18'],
  back: ['M15 5l-7 7 7 7'],
  phone: ['M6.5 4h2.6l1.6 4.2-2.1 1.3a10.5 10.5 0 0 0 5.9 5.9l1.3-2.1 4.2 1.6v2.6a1.5 1.5 0 0 1-1.6 1.5A15.5 15.5 0 0 1 5 5.6 1.5 1.5 0 0 1 6.5 4z'],
  message: ['M4.5 5.5h15v10h-9l-4.5 3.5v-3.5h-1.5z'],
  navigate: ['M4 11.2l16-7.2-7.2 16-1.9-6.9z'],
  clock: ['M12 7.5V12l3 2', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z'],
  person: ['M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M4.5 20c1.3-3.6 4.2-5.5 7.5-5.5s6.2 1.9 7.5 5.5'],
  notes: ['M6 4h12v16H6z', 'M9 9h6', 'M9 13h6', 'M9 17h3.5'],
  pin: ['M12 21s-6.5-6-6.5-11.5a6.5 6.5 0 0 1 13 0C18.5 15 12 21 12 21z', 'M12 7.2a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6z'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  plus: ['M12 5v14', 'M5 12h14'],
  skip: ['M6 6l8 6-8 6z', 'M18 6v12'],
  route: ['M6 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M18 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M6 16v-5a4 4 0 0 1 4-4h6', 'M18 8v5a4 4 0 0 1-4 4H8'],
  alert: ['M12 4l9 16H3z', 'M12 10v4.5', 'M12 17.2v.3'],
  search: ['M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z', 'M20 20l-4.4-4.4'],
  flag: ['M6 21V4', 'M6 4.5h11l-2 4 2 4H6'],
  edit: ['M4.5 19.5h4l10.5-10.5-4-4L4.5 15.5z', 'M13 7l4 4'],
  chevronDown: ['M6 9.5l6 6 6-6'],
  lines: ['M5 7h14', 'M5 11h14', 'M5 15h14', 'M5 19h9'],
  lock: ['M7 10.5h10a1.5 1.5 0 0 1 1.5 1.5v6.5a1.5 1.5 0 0 1-1.5 1.5H7a1.5 1.5 0 0 1-1.5-1.5V12A1.5 1.5 0 0 1 7 10.5z', 'M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5'],
  trash: ['M5 7h14', 'M10 7V4.5h4V7', 'M7 7l1 13h8l1-13', 'M10.5 11v5.5', 'M13.5 11v5.5'],
} as const;

export type IconName = keyof typeof PATHS | 'more';

export function Icon({ name, size = 20, color = '#1A1A1A', strokeWidth = 1.75 }: {
  name: IconName; size?: number; color?: string; strokeWidth?: number;
}) {
  if (name === 'more') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {[5, 12, 19].map((x) => <Circle key={x} cx={x} cy={12} r={1.6} fill={color} />)}
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name].map((d, i) => <Path key={i} d={d} />)}
    </Svg>
  );
}
