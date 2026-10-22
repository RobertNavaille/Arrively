import { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';
import { color } from './theme';

// The driver's location in the style of Apple Maps: a blue dot in a white
// ring, and, when we know which way they face, a soft beam fanning out that
// way and fading toward its edge. Drawn about (0, 0) with the beam pointing up
// (north); turn it by the heading.

const BEAM_R = 46;
const BEAM_HALF = 40; // degrees either side of the heading
const bx = +(BEAM_R * Math.sin((BEAM_HALF * Math.PI) / 180)).toFixed(1);
const by = -(BEAM_R * Math.cos((BEAM_HALF * Math.PI) / 180)).toFixed(1);
const BEAM_PATH = `M0 0 L${-bx} ${by} A${BEAM_R} ${BEAM_R} 0 0 1 ${bx} ${by} Z`;

/** Box the puck needs, beam included (it's drawn about the centre). */
export const PUCK_SIZE = BEAM_R * 2 + 8;

/** The puck as SVG shapes, for use inside an Svg. */
export function PuckShapes({ heading, id = 'driver-beam' }: { heading?: number | null; id?: string }) {
  return (
    <G>
      {heading != null ? (
        <>
          <Defs>
            <RadialGradient id={id} cx="0" cy="0" r={BEAM_R} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={color.brand} stopOpacity={0.6} />
              <Stop offset="1" stopColor={color.brand} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Path d={BEAM_PATH} fill={`url(#${id})`} transform={`rotate(${heading})`} />
        </>
      ) : null}
      <Circle r={11} cy={1} fill="rgba(26,26,26,0.16)" />
      <Circle r={10} fill={color.surface} />
      <Circle r={7} fill={color.brand} />
    </G>
  );
}

/** The same puck as an SVG string, for a Mapbox GL marker (which turns it by the heading itself). */
export function puckSvg(withBeam: boolean): string {
  const s = PUCK_SIZE, h = s / 2;
  const beam = withBeam
    ? `<defs><radialGradient id="driver-beam-gl" cx="0" cy="0" r="${BEAM_R}" gradientUnits="userSpaceOnUse">`
      + `<stop offset="0" stop-color="${color.brand}" stop-opacity="0.6"/><stop offset="1" stop-color="${color.brand}" stop-opacity="0"/>`
      + `</radialGradient></defs><path d="${BEAM_PATH}" fill="url(#driver-beam-gl)"/>`
    : '';
  return `<svg width="${s}" height="${s}" viewBox="${-h} ${-h} ${s} ${s}" xmlns="http://www.w3.org/2000/svg">${beam}`
    + `<circle r="11" cy="1" fill="rgba(26,26,26,0.16)"/><circle r="10" fill="${color.surface}"/><circle r="7" fill="${color.brand}"/></svg>`;
}
