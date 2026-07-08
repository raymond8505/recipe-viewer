"use client";

import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type AutoresizeTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value: string;
};

/**
 * A controlled textarea that grows to fit its content — so a step opens tall
 * enough to show all its text without an inner scrollbar, and expands as you
 * type. Height is recomputed on every value change (reset to `auto` first so it
 * can shrink as well as grow).
 */
export default function AutoresizeTextarea({
  value,
  className,
  ...rest
}: AutoresizeTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <Textarea
      ref={ref}
      value={value}
      className={cn(
        "min-h-[44px] resize-none overflow-hidden leading-relaxed text-sm",
        className,
      )}
      {...rest}
    />
  );
}
