import { useMemo } from 'react';
import { useTheme } from '@/context/ThemeContext';

/**
 * Read an HSL CSS variable (raw channels) off :root / .dark and wrap it in
 * an hsl() string so Recharts (which needs concrete colors, not CSS vars)
 * renders correctly in both light and dark themes.
 *
 * @param {string} token e.g. '--chart-1'
 * @param {number} [alpha]
 * @returns {string}
 */
export function readHsl(token, alpha) {
  if (typeof window === 'undefined') return 'hsl(0 0% 50%)';
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const channels = raw || '0 0% 50%';
  return alpha == null ? `hsl(${channels})` : `hsl(${channels} / ${alpha})`;
}

const STATUS_TOKENS = {
  'Non Contracted': '--status-non-contracted',
  Contracted: '--status-contracted',
};

const CHART_TOKENS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-6'];

/**
 * A memoized bag of resolved chart colors, re-resolved whenever the theme
 * changes. Shared by every chart in the app so they read as one system.
 */
export function useChartColors() {
  const { theme } = useTheme();
  return useMemo(() => {
    const palette = CHART_TOKENS.map((t) => readHsl(t));
    const status = Object.fromEntries(Object.entries(STATUS_TOKENS).map(([k, v]) => [k, readHsl(v)]));
    return {
      palette,
      status,
      grid: readHsl('--border'),
      axis: readHsl('--muted-foreground'),
      primary: readHsl('--primary'),
      accent: readHsl('--accent'),
      success: readHsl('--success'),
      warning: readHsl('--warning'),
      destructive: readHsl('--destructive'),
      colorFor: (i) => palette[i % palette.length],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);
}

export default useChartColors;
