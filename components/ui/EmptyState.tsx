import React from 'react';
import { cn } from '../../src/utils/cn';
import type { LucideIcon } from 'lucide-react';

export interface EmptyStateProps {
  /** Icon component to display */
  icon?: LucideIcon;
  /** Title text */
  title: string;
  /** Optional description text */
  description?: string;
  /** Optional action button */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Container variant */
  variant?: 'default' | 'bordered' | 'minimal';
  /** Additional className */
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  variant = 'default',
  className,
}) => {
  const baseStyles = "flex flex-col items-center justify-center py-12 px-4";

  const variantStyles = {
    default: "border-2 border-dashed border-border-subtle rounded-xl bg-surface/30",
    bordered: "border border-border-subtle rounded-xl bg-background",
    minimal: "",
  };

  return (
    <div className={cn(baseStyles, variantStyles[variant], className)}>
      {Icon && (
        <div className="w-12 h-12 rounded-full bg-surface shadow-sm border border-border-subtle flex items-center justify-center mb-3">
          <Icon className="w-6 h-6 text-text-secondary/50" aria-hidden="true" />
        </div>
      )}
      <p className="text-sm font-semibold text-text-secondary">{title}</p>
      {description && (
        <p className="text-xs text-text-secondary/70 mt-1 text-center max-w-sm">{description}</p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 px-4 py-2 text-sm font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

EmptyState.displayName = 'EmptyState';
