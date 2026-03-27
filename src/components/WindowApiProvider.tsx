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

    const comment = document.createComment(" Agent API: window.recipeTools is available ");
    document.body.appendChild(comment);

    return () => {
      delete (window as Partial<Window>).recipeTools;
      delete window.__agentApis__?.recipeTools;
      comment.parentNode?.removeChild(comment);
    };
  }, [router]);

  return null;
}
