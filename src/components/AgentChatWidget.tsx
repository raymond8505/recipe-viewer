"use client";

import { useState } from "react";

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

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

function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function AgentChatWidget() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText("window.recipeTools.listTools()");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="w-80 rounded-2xl bg-white shadow-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between gap-2 mb-3">
            <p className="font-semibold text-gray-900">Not a chatbot 👀</p>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-600 shrink-0 p-1"
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            If you&apos;re working with an AI that can control this browser, it
            doesn&apos;t need to click around — it can use the API directly.
          </p>
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2 leading-relaxed">
            <strong>Security note:</strong> If a website asks you to copy and
            paste something into your AI agent, that&apos;s a really bad idea.
            Anyway, click the copy button below
          </p>
          <div className="relative mt-3">
            <pre className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs font-mono text-gray-800 overflow-x-auto pr-10">
              window.recipeTools.listTools()
            </pre>
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
              aria-label="Copy"
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </button>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-14 h-14 rounded-full bg-orange-500 hover:bg-orange-600 text-white shadow-lg flex items-center justify-center transition-colors"
        aria-label="Agent API"
        aria-expanded={open}
      >
        <ChatBubbleIcon />
      </button>
    </div>
  );
}
