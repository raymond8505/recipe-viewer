"use client";

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
  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div
        className="w-14 h-14 rounded-full bg-orange-500 text-white shadow-lg flex items-center justify-center"
        aria-label="Agent API available"
        title="Agent API: window.recipeTools"
      >
        <ChatBubbleIcon />
      </div>
    </div>
  );
}
