"use client";

import { useEffect } from "react";

interface HeadsUpVsSplashProps {
  roundNumber: number;
  onComplete: () => void;
}

export default function HeadsUpVsSplash({
  roundNumber,
  onComplete,
}: HeadsUpVsSplashProps) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 1500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col items-center justify-center">
      {/* Round number */}
      <p className="text-sm font-bold uppercase tracking-[0.3em] text-gray-400 mb-4 animate-fade-in">
        Round {roundNumber}
      </p>

      {/* VS text */}
      <span className="text-7xl font-black text-orange-500 drop-shadow-[0_0_30px_rgba(249,115,22,0.6)] animate-vs-entrance select-none">
        VS
      </span>
    </div>
  );
}
