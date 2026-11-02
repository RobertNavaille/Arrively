import { useId } from 'react';
import Svg, { Defs, G, Mask, Path, Rect } from 'react-native-svg';

// Solid icons on a 24-unit grid, drawn for Arrively in the same filled style as
// the SF Symbols the iPhone app shows (Icon.ios.tsx). SF Symbols may only be
// used on Apple platforms, so the web and Android get these.
//   fill:    filled shapes
//   line:    stroked lines (strokeWidth, default 2.25)
//   cut:     lines cut out of the filled shapes
//   cutFill: shapes cut out of the filled shapes
type Shape = { fill?: string[]; line?: string[]; cut?: string[]; cutFill?: string[] };

const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;

const SHAPES = {
  close: { line: ['M6.5 6.5l11 11', 'M17.5 6.5l-11 11'] },
  back: { line: ['M15 5l-7 7 7 7'] },
  phone: { fill: ['M6.6 3.5h2.7c.5 0 .9.3 1.1.8l1.4 3.6c.2.5 0 1.1-.4 1.4l-1.7 1.1a10.4 10.4 0 0 0 5.4 5.4l1.1-1.7c.3-.4.9-.6 1.4-.4l3.6 1.4c.5.2.8.6.8 1.1v2.7c0 1.1-.9 2-2 1.9C10.9 20.2 3.8 13.1 3.2 5.5c-.1-1.1.8-2 1.9-2z'] },
  message: { fill: ['M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7.5L6.5 20.6c-.5.4-1.2 0-1.2-.6V17H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'] },
  navigate: { fill: ['M3.8 10.6l15.6-6.9c.6-.3 1.2.3.9.9l-6.9 15.6c-.3.7-1.3.6-1.5-.1l-1.6-6-6-1.6c-.7-.2-.8-1.2-.1-1.5z'] },
  clock: { fill: [circle(12, 12, 9.5)], cut: ['M12 7v5.2l3.3 2'] },
  person: { fill: [circle(12, 7.8, 4.3), 'M3.8 20.2c.6-3.9 4-6.4 8.2-6.4s7.6 2.5 8.2 6.4c.1.5-.3.8-.7.8H4.5c-.4 0-.8-.3-.7-.8z'] },
  notes: { fill: ['M7 2.8h10a2 2 0 0 1 2 2v14.4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4.8a2 2 0 0 1 2-2z'], cut: ['M8.8 8.3h6.4', 'M8.8 12.2h6.4', 'M8.8 16.1h3.8'] },
  pin: { fill: ['M12 21.5s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z'], cutFill: [circle(12, 9.4, 2.6)] },
  check: { line: ['M5 12.5l4.5 4.5L19 7.5'] },
  plus: { line: ['M12 5v14', 'M5 12h14'] },
  skip: { fill: ['M5 6.4c0-.8.9-1.3 1.6-.8l8 5.6c.6.4.6 1.2 0 1.6l-8 5.6c-.7.5-1.6 0-1.6-.8z', 'M16.6 5.5h1.6c.5 0 .8.4.8.8v11.4c0 .4-.3.8-.8.8h-1.6c-.4 0-.8-.4-.8-.8V6.3c0-.4.4-.8.8-.8z'] },
  route: { fill: [circle(5.8, 17.8, 2.6), circle(18.2, 6.2, 2.6)], line: ['M9 17.8h5.2a3.1 3.1 0 0 0 0-6.2H9.8a3.1 3.1 0 0 1 0-6.2H15'] },
  alert: { fill: ['M10.3 4.2c.8-1.3 2.6-1.3 3.4 0l7.6 13c.8 1.3-.2 3-1.7 3H4.4c-1.5 0-2.5-1.7-1.7-3z'], cut: ['M12 9.2v4.6'], cutFill: [circle(12, 16.9, 1.15)] },
  search: { line: [circle(10.8, 10.8, 6.3), 'M15.5 15.5l4.5 4.5'] },
  flag: { fill: ['M6.5 4h11.2c.6 0 1 .7.7 1.2L16.3 9l2.1 3.8c.3.5-.1 1.2-.7 1.2H6.5z'], line: ['M5.5 21V3.5'] },
  edit: { fill: ['M15.1 4.2a1.8 1.8 0 0 1 2.5 0l2.2 2.2a1.8 1.8 0 0 1 0 2.5L9.4 19.3c-.2.2-.5.4-.8.4l-4.1.8c-.6.1-1.1-.4-1-1l.8-4.1c.1-.3.2-.6.4-.8z'] },
  chevronDown: { line: ['M6 9.5l6 6 6-6'] },
  lines: { line: ['M5 7h14', 'M5 11h14', 'M5 15h14', 'M5 19h9'] },
  lock: { fill: ['M7 10h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z'], line: ['M8.3 10V7.7a3.7 3.7 0 0 1 7.4 0V10'] },
  trash: { fill: ['M6.3 8.5h11.4l-.9 11.3a1.8 1.8 0 0 1-1.8 1.7H9a1.8 1.8 0 0 1-1.8-1.7z'], line: ['M4.5 6h15', 'M9.5 6V4.6c0-.6.4-1 1-1h3c.6 0 1 .4 1 1V6'], cut: ['M10.4 11.5v6.5', 'M13.6 11.5v6.5'] },
  more: { fill: [circle(5, 12, 2), circle(12, 12, 2), circle(19, 12, 2)] },
} satisfies Record<string, Shape>;

export type IconName = keyof typeof SHAPES;

export function SvgIcon({ name, size = 20, color = '#1A1A1A', strokeWidth = 2.25 }: {
  name: IconName; size?: number; color?: string; strokeWidth?: number;
}) {
  const s: Shape = SHAPES[name];
  const mask = `icon-cut-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const cuts = !!(s.cut?.length || s.cutFill?.length);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {cuts ? (
        <Defs>
          <Mask id={mask} maskUnits="userSpaceOnUse" x={0} y={0} width={24} height={24}>
            <Rect x={0} y={0} width={24} height={24} fill="#fff" />
            {s.cut?.map((d, i) => <Path key={`c${i}`} d={d} fill="none" stroke="#000" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />)}
            {s.cutFill?.map((d, i) => <Path key={`f${i}`} d={d} fill="#000" />)}
          </Mask>
        </Defs>
      ) : null}
      <G mask={cuts ? `url(#${mask})` : undefined}>
        {s.fill?.map((d, i) => <Path key={`s${i}`} d={d} fill={color} />)}
        {s.line?.map((d, i) => <Path key={`l${i}`} d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />)}
      </G>
    </Svg>
  );
}

