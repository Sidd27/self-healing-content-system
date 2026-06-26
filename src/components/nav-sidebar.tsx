'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Database, ClipboardCheck, BookOpen } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

const adminLinks = [
  { href: '/admin/sources', label: 'Sources', icon: Database },
  { href: '/admin/review', label: 'Review Queue', icon: ClipboardCheck },
]

const learnerLinks = [
  { href: '/learner', label: 'Browse Topics', icon: BookOpen },
]

export function NavSidebar() {
  const pathname = usePathname()

  return (
    <nav className="w-56 flex-shrink-0 border-r bg-sidebar p-4 flex flex-col gap-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Admin
      </p>
      {adminLinks.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            'flex items-center gap-2 text-sm px-2 py-1.5 rounded transition-colors',
            pathname.startsWith(href)
              ? 'bg-accent text-accent-foreground font-medium'
              : 'hover:bg-accent hover:text-accent-foreground'
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {label}
        </Link>
      ))}
      <Separator className="my-3" />
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Learner
      </p>
      {learnerLinks.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            'flex items-center gap-2 text-sm px-2 py-1.5 rounded transition-colors',
            pathname.startsWith(href)
              ? 'bg-accent text-accent-foreground font-medium'
              : 'hover:bg-accent hover:text-accent-foreground'
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {label}
        </Link>
      ))}
    </nav>
  )
}
