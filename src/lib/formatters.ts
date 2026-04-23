/**
 * Shared formatters used across the TanStack data grids and analytics surface.
 *
 * Keep these fast and allocation-light — they run inside hot render paths
 * (pagination footers, virtualized cell renderers, tooltips, …).
 */

/**
 * Format a duration expressed in seconds for display. Falls back to 0s for
 * non-finite / negative values.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0s";
  if (seconds < 0.001) return `${(seconds * 1_000_000).toFixed(0)}μs`;
  if (seconds < 1) return `${(seconds * 1000).toFixed(1)}ms`;
  return `${seconds.toFixed(2)}s`;
}

/**
 * Format a duration expressed in milliseconds. Uses Intl for locale-aware
 * formatting where beneficial.
 */
export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0ms";
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
  if (ms < 3_600_000) {
    const mins = Math.floor(ms / 60_000);
    const secs = ((ms % 60_000) / 1000).toFixed(0);
    return `${mins}m ${secs}s`;
  }
  const hrs = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  return `${hrs}h ${mins}m`;
}

/**
 * Format a byte count with binary units (KB/MB/GB).
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

/**
 * Compact number formatter for chart axes (1K, 1M, 1B).
 */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toLocaleString();
}
