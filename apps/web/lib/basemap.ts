// The base map's look, shared by the phone (Mapbox Maps SDK) and the web
// (Mapbox GL JS): Mapbox Standard in its muted ("faded") theme, tuned toward
// the calm look of Apple Maps' muted style: warm pale land, soft blue water,
// gentle green parks, white roads, flat buildings and no points of interest,
// so the route and stops stand out. Keep in step with apps/driver/src/ui/basemap.ts.
export const BASEMAP_STYLE = 'mapbox://styles/mapbox/standard';

export const BASEMAP_CONFIG = {
  lightPreset: 'day',
  theme: 'faded',
  showPointOfInterestLabels: false,
  showTransitLabels: false,
  show3dObjects: false,
  show3dBuildings: false,
  show3dLandmarks: false,
  show3dTrees: false,
  show3dFacades: false,
  colorLand: '#F3F1EC',
  colorWater: '#B8D6F2',
  colorGreenspaces: '#D5E8C9',
  colorRoads: '#FFFFFF',
  colorMotorways: '#FBE7B8',
  colorBuildings: '#E6E3DD',
} as const;
