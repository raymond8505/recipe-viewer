"use client";

export default function HeadsUpPortraitGuard() {
  return (
    <div className="fixed inset-0 z-60 bg-gray-900 flex flex-col items-center justify-center text-center px-8">
      {/* Rotating phone icon */}
      <svg
        width="80"
        height="80"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-orange-500 animate-rotate-phone mb-6"
      >
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
        <path d="M12 18h.01" />
      </svg>

      <h2 className="text-2xl font-black uppercase tracking-wider text-orange-500 mb-2">
        Rotate Your Device
      </h2>
      <p className="text-gray-400 text-sm max-w-xs">
        Heads Up mode requires landscape orientation
      </p>
    </div>
  );
}
