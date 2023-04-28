import { ReactNode } from "react";
import { cn } from "../lib/utils";

export type PromptProps = {
  children: ReactNode;
  className: string;
};

export function Prompt({ children, className }: PromptProps) {
  return (
    <p className={cn(["bg-slate-900 p-4 rounded-md max-w-prose", className])}>
      {children}
    </p>
  );
}
