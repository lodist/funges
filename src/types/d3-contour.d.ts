// The part of d3-contour the garden map uses (no @types package for one call).
declare module 'd3-contour' {
  interface Contour {
    type: 'MultiPolygon';
    value: number;
    coordinates: number[][][][];
  }
  interface Contours {
    (values: ArrayLike<number>): Contour[];
    size(size: [number, number]): Contours;
    smooth(smooth: boolean): Contours;
    thresholds(thresholds: number[]): Contours;
  }
  export function contours(): Contours;
}
