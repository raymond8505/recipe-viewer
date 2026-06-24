"use client";

import { useState } from "react";
import { ChatBubbleIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/buttons";

export default function AgentChatWidget() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <IconButton
        className="size-14 rounded-full bg-brand text-white shadow-lg hover:bg-brand/90 hover:text-white"
        aria-label="Agent API available"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <ChatBubbleIcon />
      </IconButton>

      {open && (
        <div className="absolute bottom-16 right-0 w-64 rounded-lg bg-white shadow-xl p-4 text-sm text-gray-700">
          <p>This is not a chatbot.</p>
          <p className="mt-2">
            Use <code>window.recipeTools</code> in the browser console.
          </p>
          <Button
            variant="link"
            className="mt-3 h-auto p-0 text-xs text-muted-foreground underline"
            aria-label="Close"
            onClick={() => setOpen(false)}
          >
            Close
          </Button>
        </div>
      )}
    </div>
  );
}
