export function SpinnerIcon({
  size = 16,
  className = "text-brand shrink-0 animate-spin",
}: { size?: number; className?: string } = {}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2v4" />
      <path d="m16.24 7.76 2.83-2.83" opacity=".3" />
      <path d="M18 12h4" opacity=".3" />
      <path d="m16.24 16.24 2.83 2.83" opacity=".3" />
      <path d="M12 18v4" opacity=".3" />
      <path d="m7.76 16.24-2.83 2.83" opacity=".3" />
      <path d="M6 12H2" opacity=".3" />
      <path d="m7.76 7.76-2.83-2.83" opacity=".3" />
    </svg>
  );
}
