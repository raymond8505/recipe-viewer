"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PrimaryActionButton } from "@/components/buttons";

export default function AuthButton({ isLoggedIn }: { isLoggedIn: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    setOpen(false);
    setPassword("");
    setError("");
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        close();
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

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  }

  if (isLoggedIn) {
    return (
      <Button
        variant="ghost"
        onClick={handleLogout}
        className="h-auto min-h-[44px] min-w-[44px] px-4 text-muted-foreground hover:bg-transparent hover:text-foreground"
      >
        Logout
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        onClick={() => setOpen(true)}
        className="h-auto min-h-[44px] min-w-[44px] px-4 text-muted-foreground hover:bg-transparent hover:text-foreground"
      >
        Login
      </Button>

      {open && (
        <div
          ref={overlayRef}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === overlayRef.current) close();
          }}
        >
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-lg text-gray-900 mb-4">Login</h2>
            <form onSubmit={handleLogin} className="space-y-4">
              <input
                ref={inputRef}
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full min-h-[44px] px-4 border border-gray-300 rounded-xl text-base focus:outline-hidden focus:ring-2 focus:ring-orange-400"
                autoComplete="current-password"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={close}
                  className="h-auto min-h-[44px] flex-1"
                >
                  Cancel
                </Button>
                <PrimaryActionButton
                  type="submit"
                  disabled={loading || !password}
                  className="h-auto min-h-[44px] flex-1"
                >
                  {loading ? "Logging in…" : "Login"}
                </PrimaryActionButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
