/**
 * 60x20 trend glyph — six weekly pooled Pipes ROAS values, oldest first.
 *
 * Hand-rolled SVG rather than a charting library: it is a static polyline, so
 * a library would cost a client boundary and a bundle for fifteen lines of
 * path math. Ported from the mockup's sparkPath().
 *
 * Note the line is normalized to its OWN min/max, so it shows shape, not
 * level: two editors with very different ROAS can produce similar-looking
 * lines. That is intentional for a trend glyph sitting beside the actual
 * figure, but it is why the sparkline never carries a verdict on its own.
 */

const WIDTH = 60;
const HEIGHT = 20;
const PAD = 2;

export function sparkPath(values: number[]): string {
  if (values.length === 0) return '';
  if (values.length === 1) {
    const y = HEIGHT / 2;
    return `M${PAD},${y.toFixed(1)} L${(WIDTH - PAD).toFixed(1)},${y.toFixed(1)}`;
  }

  const max = Math.max(...values, 0.01);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  return (
    'M' +
    values
      .map((v, i) => {
        const x = PAD + (i / (values.length - 1)) * (WIDTH - PAD * 2);
        const y = HEIGHT - PAD - ((v - min) / range) * (HEIGHT - PAD * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' L')
  );
}

export function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length === 0) return <div style={{ width: WIDTH, height: HEIGHT, flex: 'none' }} />;

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      style={{ flex: 'none' }}
      aria-hidden="true"
    >
      <path
        d={sparkPath(values)}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
