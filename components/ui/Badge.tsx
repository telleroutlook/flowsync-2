import * as React from "react"
import { cn } from "../../src/utils/cn"
import type { LucideIcon } from 'lucide-react';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning"
  icon?: LucideIcon;
}

function Badge({ className, variant = "default", icon: Icon, children, ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        {
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80": variant === "default",
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80": variant === "secondary",
          "border-transparent bg-error text-error-foreground hover:bg-error/80": variant === "destructive",
          "text-text-primary": variant === "outline",
          "border-transparent bg-success text-success-foreground hover:bg-success/80": variant === "success",
          "border-transparent bg-warning text-warning-foreground hover:bg-warning/80": variant === "warning",
        },
        className
      )}
      {...props}
    >
      {Icon && <Icon className="w-3 h-3" aria-hidden="true" />}
      {children}
    </div>
  )
}

export { Badge }
