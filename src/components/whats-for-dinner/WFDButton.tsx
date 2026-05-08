import Link from "next/link";

export default function WFDButton() {
  return (
    <Link
      href="/whats-for-dinner"
      className="
        inline-flex items-center gap-2
        px-4 py-2.5 min-h-[44px]
        text-sm font-bold uppercase tracking-wider
        bg-gray-900 text-sky-400 rounded-xl
        border border-gray-700
        hover:bg-gray-800 hover:border-sky-500 hover:text-sky-300
        active:bg-gray-700
        transition-colors
      "
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <path d="M3 11l19-9-9 19-2-8-8-2z" />
      </svg>
      What&rsquo;s for Dinner?
    </Link>
  );
}
