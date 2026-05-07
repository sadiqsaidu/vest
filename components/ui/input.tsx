import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-md border border-border bg-surface-sunken px-3 text-sm",
        "placeholder:text-text-subtle",
        "focus:outline-none focus:border-border-strong",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
