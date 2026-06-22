"use client";

import { useState } from "react";

interface HeadsUpPromptProps {
  onSubmit: (prompt: string) => void;
  isLoading: boolean;
  error: string | null;
}

export default function HeadsUpPrompt({ onSubmit, isLoading, error }: HeadsUpPromptProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed && !isLoading) {
      onSubmit(trimmed);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-8">
      <div className="w-full max-w-lg space-y-8 text-center">
        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-4xl font-black uppercase tracking-wider text-orange-500 drop-shadow-[0_0_20px_rgba(249,115,22,0.4)]">
            Heads Up
          </h1>
          <p className="text-gray-400 text-sm">
            What are you in the mood for?
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder='e.g. "something warm for dinner"'
            disabled={isLoading}
            autoFocus
            className="
              w-full px-5 py-4 text-lg text-white
              bg-gray-800 border-2 border-gray-700 rounded-2xl
              placeholder-gray-500
              focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30 focus:outline-hidden
              disabled:opacity-50
              transition-colors
            "
          />

          <button
            type="submit"
            disabled={!value.trim() || isLoading}
            className="
              w-full px-6 py-4 min-h-[52px]
              text-lg font-black uppercase tracking-wider
              bg-orange-500 text-white rounded-2xl
              hover:bg-orange-600 active:bg-orange-700
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors
              flex items-center justify-center gap-2
            "
          >
            {isLoading ? (
              <>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  className="animate-spin"
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
                Searching&hellip;
              </>
            ) : (
              "Fight!"
            )}
          </button>
        </form>

        {/* Error display */}
        {error && (
          <div className="px-4 py-3 bg-red-900/30 border border-red-700/50 rounded-xl text-sm text-red-300">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
