'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Database, GitFork, BookOpen, Zap } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const adminLinks = [
  { href: '/admin/sources', label: 'Sources', icon: Database },
  { href: '/admin/pipeline', label: 'Pipeline', icon: GitFork },
];

const learnerLinks = [{ href: '/learner', label: 'Learn', icon: BookOpen }];

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
          : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
      )}
    >
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-indigo-400" />
      )}
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </Link>
  );
}

export function NavSidebar() {
  const pathname = usePathname();

  return (
    <nav className="w-52 flex-shrink-0 flex flex-col bg-sidebar border-r border-sidebar-border">
      {/* Brand */}
      <div className="px-4 pt-5 pb-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-indigo-500/20">
            <Zap className="h-3.5 w-3.5 text-indigo-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-sidebar-foreground leading-none">Pulse</p>
            <p className="text-[10px] text-sidebar-foreground/40 mt-0.5">Content System</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 px-3 py-4 space-y-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/35 px-3 mb-1.5">
            Admin
          </p>
          <div className="space-y-0.5">
            {adminLinks.map(({ href, label, icon }) => (
              <NavLink
                key={href}
                href={href}
                label={label}
                icon={icon}
                active={pathname.startsWith(href)}
              />
            ))}
          </div>
        </div>

        <Separator className="bg-sidebar-border" />

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/35 px-3 mb-1.5">
            Learner
          </p>
          <div className="space-y-0.5">
            {learnerLinks.map(({ href, label, icon }) => (
              <NavLink
                key={href}
                href={href}
                label={label}
                icon={icon}
                active={pathname.startsWith(href)}
              />
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
