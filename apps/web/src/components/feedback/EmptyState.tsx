import React from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon: Icon = Inbox,
  action,
}) => {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500 space-y-3">
      <Icon className="w-10 h-10 text-slate-300 mx-auto" aria-hidden="true" />
      <h3 className="font-semibold text-slate-700 text-sm">{title}</h3>
      {description && <p className="text-xs text-slate-400 max-w-sm mx-auto">{description}</p>}
      {action}
    </div>
  );
};
