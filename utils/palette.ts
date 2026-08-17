export const PROCESS_PALETTE = [
  '#ec4899', // Pink / Magenta
  '#f59e0b', // Amber / Gold
  '#10b981', // Emerald
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#f97316', // Orange
  '#14b8a6', // Teal
  '#e11d48'  // Rose
];

export function getProcessColor(key: string, index?: number): string {
  if (typeof index === 'number' && index >= 0) {
    return PROCESS_PALETTE[index % PROCESS_PALETTE.length];
  }
  if (!key) return PROCESS_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % PROCESS_PALETTE.length;
  return PROCESS_PALETTE[idx];
}
