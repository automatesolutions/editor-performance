import type { Config } from 'tailwindcss';

/**
 * Design tokens lifted verbatim from the design mockup
 * ("Editor Performance Dashboard.html"). Do not re-derive these by eye —
 * they are oklch values copied from the handoff and the dashboard is meant
 * to be pixel-close to it.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'oklch(98% 0.003 250)',
        card: '#ffffff',
        'card-border': 'oklch(91% 0.005 250)',
        rule: 'oklch(93% 0.004 250)',
        'rule-dashed': 'oklch(90% 0.005 250)',
        ink: 'oklch(20% 0.01 250)',
        'ink-soft': 'oklch(35% 0.01 250)',
        muted: 'oklch(55% 0.01 250)',
        'muted-deep': 'oklch(45% 0.01 250)',
        'muted-light': 'oklch(58% 0.01 250)',
        positive: 'oklch(55% 0.15 145)',
        negative: 'oklch(55% 0.19 25)',
        neutral: 'oklch(65% 0.01 250)',
        // Editor row tile
        tile: 'oklch(98% 0.002 250)',
        // Target badge (blue)
        'badge-target-bg': 'oklch(95% 0.03 255)',
        'badge-target-fg': 'oklch(45% 0.13 255)',
        // "Target not set" badge (warm grey)
        'badge-unset-bg': 'oklch(95% 0.01 60)',
        'badge-unset-fg': 'oklch(48% 0.02 60)',
        // Floor badge (neutral)
        'badge-floor-bg': 'oklch(96% 0.003 250)',
        'badge-floor-fg': 'oklch(48% 0.01 250)',
        // Alert banner (amber)
        'alert-bg': 'oklch(97% 0.04 70)',
        'alert-border': 'oklch(80% 0.09 70)',
        'alert-fg': 'oklch(38% 0.09 60)',
        // Panel for "no spend this week"
        panel: 'oklch(97% 0.003 250)',
      },
      borderRadius: {
        card: '14px',
        tile: '10px',
        badge: '6px',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-plex-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // The mockup uses a lot of half-pixel sizes; keep them exact.
        '2xs': '11px',
        'badge': '11.5px',
        'xs+': '12px',
        'ad': '12.5px',
        'stat': '13px',
        'chip': '13.5px',
        'sm+': '14px',
        'editor': '15px',
        'acct': '17px',
        'title': '28px',
      },
      gridTemplateColumns: {
        accounts: 'repeat(auto-fill, minmax(440px, 1fr))',
      },
    },
  },
  plugins: [],
};

export default config;
