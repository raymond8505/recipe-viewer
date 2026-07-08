export function PlayIcon({ dimmed }: { dimmed?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className={`shrink-0 ${dimmed ? "text-gray-300" : "text-brand"}`} aria-hidden="true">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  );
}
