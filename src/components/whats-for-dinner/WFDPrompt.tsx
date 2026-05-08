"use client";

import { useState } from "react";
import { SpinnerIcon } from "@/components/icons";

interface WFDPromptProps {
  onSubmit: (prompt: string) => void;
  isLoading: boolean;
  error: string | null;
}

export default function WFDPrompt({ onSubmit, isLoading, error }: WFDPromptProps) {
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
        <div className="space-y-2">
          <h1 className="text-4xl font-black uppercase tracking-wider text-sky-400">
            What&rsquo;s for Dinner?
          </h1>
          <p className="text-gray-400 text-sm">
            What are you in the mood for tonight?
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder='e.g. "something quick and spicy"'
            disabled={isLoading}
            autoFocus
            className="
              w-full px-5 py-4 text-lg text-white
              bg-gray-800 border-2 border-gray-700 rounded-2xl
              placeholder-gray-500
              focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 focus:outline-none
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
              bg-sky-600 text-white rounded-2xl
              hover:bg-sky-700 active:bg-sky-800
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors
              flex items-center justify-center gap-2
            "
          >
            {isLoading ? (
              <>
                <SpinnerIcon size={20} className="animate-spin" />
                Finding options&hellip;
              </>
            ) : (
              "Let's go"
            )}
          </button>
        </form>

        {error && (
          <div className="px-4 py-3 bg-red-900/30 border border-red-700/50 rounded-xl text-sm text-red-300">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
