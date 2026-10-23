// Arrively design tokens (mirrors the Arrively design system's tokens.json).
export const color = {
  brand: '#009DFE',
  brandTint: '#D1EDFF',
  action: '#009DFF',
  actionInk: '#0072C6',
  onTint: '#005FA8',
  onAction: '#FFFFFF',
  ink: '#1A1A1A',
  inkMuted: '#6B717B',
  surface: '#FFFFFF',
  surfaceMuted: '#F4F5F7',
  divider: '#E6E8EB',
  controlBorder: '#8A9099',
  danger: '#D92D20',
  warning: '#B54708',
  warningTint: '#FEF3E2',
  success: '#067647',
  mapGround: '#ECEDEF',
  mapBlock: '#E1E3E6',
  mapRoad: '#FFFFFF',
  mapLabel: '#3C4043',
  scrim: 'rgba(26, 26, 26, 0.4)',
} as const;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 20, full: 999 } as const;

export const font = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
} as const;

export const type = {
  stat: { fontFamily: font.semibold, fontSize: 28, lineHeight: 32, color: color.ink },
  title: { fontFamily: font.semibold, fontSize: 20, lineHeight: 28, color: color.ink },
  heading: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22, color: color.ink },
  body: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: color.ink },
  bodyStrong: { fontFamily: font.semibold, fontSize: 14, lineHeight: 20, color: color.ink },
  caption: { fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: color.inkMuted },
  label: { fontFamily: font.medium, fontSize: 11, lineHeight: 14, letterSpacing: 0.2, color: color.inkMuted },
} as const;

export const shadow = {
  sheet: { shadowColor: '#1A1A1A', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 8 },
  float: { shadowColor: '#1A1A1A', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
} as const;

// Inputs drawn inside a field box: the box already shows focus, so drop the
// browser's own outline (web only; native ignores it), and let the input shrink
// so icons beside it keep their size.
export const bareInput = { outlineWidth: 0, minWidth: 0 } as unknown as Record<string, never>;
