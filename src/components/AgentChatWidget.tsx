"use client";

import { useState } from "react";
import { ChatBubbleIcon } from "@/components/icons";

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
