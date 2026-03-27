"use client";

import { useState } from "react";

function ChatBubbleIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export default function AgentChatWidget() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <button
        className="w-14 h-14 rounded-full bg-orange-500 text-white shadow-lg flex items-center justify-center"
        aria-label="Agent API available"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <ChatBubbleIcon />
      </button>

      {open && (
        <div className="absolute bottom-16 right-0 w-64 rounded-lg bg-white shadow-xl p-4 text-sm text-gray-700">
          <p>This is not a chatbot.</p>
          <p className="mt-2">
            Use <code>window.recipeTools</code> in the browser console.
          </p>
          <button
            className="mt-3 text-xs text-gray-500 underline"
            aria-label="Close"
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
