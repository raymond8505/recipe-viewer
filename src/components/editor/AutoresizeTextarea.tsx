"use client";

import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

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
  ...rest
}: AutoresizeTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return <textarea ref={ref} value={value} {...rest} />;
}
