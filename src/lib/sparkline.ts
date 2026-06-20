// Shared sparkline geometry — used by ProjectCard.astro (server render) and
// the live-traffic client script (re-render when GA4 data arrives) so both
// produce identical paths.

export const CHART = { W: 300, H: 90, PAD_Y: 10 } as const;

export interface SparkPaths {
  linePath: string;
  areaPath: string;
  max: number;
  min: number;
}

/** Catmull-Rom -> cubic Bézier smoothing of a value series into SVG paths. */
export function buildSparkline(data: number[]): SparkPaths {
  const { W, H, PAD_Y } = CHART;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - PAD_Y - ((v - min) / range) * (H - PAD_Y * 2);
    return [x, y] as [number, number];
  });

  let linePath = "";
  if (points.length >= 2) {
    linePath = `M ${points[0][0]},${points[0][1]}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] ?? points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] ?? p2;
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
      linePath += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
    }
  }

  const areaPath = `${linePath} L ${W},${H} L 0,${H} Z`;
  return { linePath, areaPath, max, min };
}

/** 14000 -> "14k", 6800 -> "6.8k", 940 -> "940". */
export function fmtK(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return (k >= 10 ? Math.round(k).toString() : k.toFixed(1).replace(/\.0$/, "")) + "k";
  }
  return Math.round(n).toString();
}

/** Normalise a hostname for matching: lowercase, strip leading "www." */
export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, "");
}
