import Link from "next/link";

export default function HeadsUpButton() {
  return (
    <Link
      href="/headsup"
      className="
        inline-flex items-center gap-2
        px-4 py-2.5 min-h-[44px]
        text-sm font-bold uppercase tracking-wider
        bg-gray-900 text-orange-400 rounded-xl
        border border-gray-700
        hover:bg-gray-800 hover:border-orange-500 hover:text-orange-300
        active:bg-gray-700
        transition-colors
      "
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
      </svg>
      Heads Up
    </Link>
  );
}
