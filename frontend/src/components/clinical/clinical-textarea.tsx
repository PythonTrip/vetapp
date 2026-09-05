"use client";

import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// Keep clinical notes in the page scroll flow even without field-sizing support.
export function ClinicalTextarea({ className, value, ...props }: React.ComponentProps<"textarea">) {
  const ref = React.useRef<HTMLTextAreaElement>(null);

  const resize = React.useCallback(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    const style = getComputedStyle(element);
    const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    element.style.height = `${element.scrollHeight + border}px`;
  }, []);

  React.useLayoutEffect(resize, [resize, value]);
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let width = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === width) return;
      width = entry.contentRect.width;
      resize();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [resize]);

  return (
    <Textarea
      {...props}
      ref={ref}
      value={value}
      className={cn(className, "field-sizing-fixed resize-none overflow-hidden")}
    />
  );
}
