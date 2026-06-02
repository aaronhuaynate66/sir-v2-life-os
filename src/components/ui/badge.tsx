import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      // Pills = fondo soft + texto del mismo color. Semánticos solo significan.
      variant: {
        default:
          "border-transparent bg-secondary text-secondary-foreground",
        secondary:
          "border-transparent bg-secondary text-muted-foreground",
        outline: "border-border text-muted-foreground",
        // Acento de marca (IA / destacado).
        brand: "border-transparent bg-brand-soft text-brand-soft-foreground",
        // Semánticos (salud / estado).
        ok: "border-transparent bg-ok-soft text-ok-foreground",
        warn: "border-transparent bg-warn-soft text-warn-foreground",
        bad: "border-transparent bg-bad-soft text-bad-foreground",
        destructive: "border-transparent bg-bad-soft text-bad-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
