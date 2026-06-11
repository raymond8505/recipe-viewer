"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginWithPassword } from "@/lib/api/auth";

interface AuthorizeParams {
  client_id: string;
  redirect_uri: string;
  response_type: "code";
  code_challenge: string;
  code_challenge_method: string;
  state: string;
  scope: string;
}

export default function OAuthConsent({
  isLoggedIn: initialIsLoggedIn,
  clientName,
  scope,
  params,
}: {
  isLoggedIn: boolean;
  clientName: string;
  scope: string;
  params: AuthorizeParams;
}) {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(initialIsLoggedIn);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const ok = await loginWithPassword(password);
      if (ok) {
        setIsLoggedIn(true);
        setPassword("");
        router.refresh();
      } else {
        setError("Incorrect password.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!isLoggedIn) {
    return (
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900">Sign in to continue</h2>
        <p className="mt-1 text-sm text-gray-600">
          <span className="font-medium">{clientName}</span> wants to access your Recipe Viewer.
        </p>
        <form onSubmit={handleLogin} className="mt-5 space-y-4">
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full min-h-[44px] px-4 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-orange-400"
            autoComplete="current-password"
            autoFocus
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full min-h-[44px] rounded-xl bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <form
      method="POST"
      action="/api/oauth/authorize"
      className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8"
    >
      <h1 className="text-xl font-semibold text-gray-900">Authorize {clientName}?</h1>
      <p className="mt-2 text-sm text-gray-600">
        This will let <span className="font-medium">{clientName}</span> read and modify your recipes via the
        MCP server. You can revoke access by deleting the client row in Supabase.
      </p>
      <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
        <div className="font-medium text-gray-900">Requested scope</div>
        <div className="mt-1 font-mono text-xs text-gray-600">{scope}</div>
      </div>

      {(Object.keys(params) as Array<keyof AuthorizeParams>).map((key) => (
        <input key={key} type="hidden" name={key} value={params[key]} />
      ))}

      <div className="mt-6 flex gap-3">
        <button
          type="submit"
          name="action"
          value="deny"
          className="flex-1 min-h-[44px] rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
        >
          Deny
        </button>
        <button
          type="submit"
          name="action"
          value="allow"
          className="flex-1 min-h-[44px] rounded-xl bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition"
        >
          Allow
        </button>
      </div>
    </form>
  );
}
