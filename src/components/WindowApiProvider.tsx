"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createRecipeToolsApi } from "@/lib/windowApi";

export default function WindowApiProvider() {
  const router = useRouter();

  useEffect(() => {
    const api = createRecipeToolsApi((url) => router.push(url));
    window.recipeTools = api;
    window.__agentApis__ = { ...window.__agentApis__, recipeTools: api };

    console.log(
      "[AI Tools Available] This page exposes a programmatic API. " +
      "Call window.recipeTools.listTools() to discover available actions."
    );

    const comment = document.createComment(
      " Agent? Run window.__agentApis__.recipeTools.listTools() to discover available browser APIs "
    );
    document.body.prepend(comment);

    return () => {
      delete (window as Partial<Window>).recipeTools;
      delete window.__agentApis__?.recipeTools;
      document.body.removeChild(comment);
    };
  }, [router]);

  return null;
}
