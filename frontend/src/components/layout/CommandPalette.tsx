'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  LayoutDashboard,
  Brain,
  Layers,
  Sparkles,
  TrendingUp,
  Briefcase,
  ShieldCheck,
  FolderLock,
  Settings,
  PlusCircle,
  CreditCard,
  Building2,
  Bell,
  MessageSquare,
} from 'lucide-react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/Command';

export interface CommandPaletteProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CommandPalette({ open: controlledOpen, onOpenChange }: CommandPaletteProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const router = useRouter();

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setOpen = React.useCallback(
    (open: boolean) => {
      if (isControlled) {
        onOpenChange?.(open);
      } else {
        setInternalOpen(open);
      }
    },
    [isControlled, onOpenChange]
  );

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(!isOpen);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setOpen]);

  const handleSelect = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <CommandDialog open={isOpen} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search pages..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Platform & Intelligence">
          <CommandItem onSelect={() => handleSelect('/fundability')}>
            <Brain className="mr-2 h-4 w-4 text-brand-orange-500" />
            <span>Fundability Score</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect('/application-intelligence')}>
            <Sparkles className="mr-2 h-4 w-4 text-indigo-500" />
            <span>Application Intelligence</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect('/pipeline')}>
            <Layers className="mr-2 h-4 w-4 text-blue-500" />
            <span>Funding Pipeline & Opportunities</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect('/discover')}>
            <TrendingUp className="mr-2 h-4 w-4 text-emerald-500" />
            <span>Discover & Deal Matching</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect('/evidence')}>
            <ShieldCheck className="mr-2 h-4 w-4 text-amber-500" />
            <span>Evidence Vault</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Deal Flow & Investors">
          <CommandItem onSelect={() => handleSelect('/investors')}>
            <Building2 className="mr-2 h-4 w-4 text-slate-500" />
            <span>Investor Directory</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect('/offers')}>
            <Briefcase className="mr-2 h-4 w-4 text-violet-500" />
            <span>Term Sheet Offers</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect('/dataroom')}>
            <FolderLock className="mr-2 h-4 w-4 text-rose-500" />
            <span>Data Rooms</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect('/newsfeed')}>
            <LayoutDashboard className="mr-2 h-4 w-4 text-slate-500" />
            <span>Newsfeed & Radar</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Quick Actions">
          <CommandItem onSelect={() => handleSelect('/pitches/new')}>
            <PlusCircle className="mr-2 h-4 w-4 text-brand-orange-500" />
            <span>Create New Pitch</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect('/startup/traction')}>
            <TrendingUp className="mr-2 h-4 w-4 text-emerald-500" />
            <span>Log Traction & Revenue</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect('/upgrade')}>
            <CreditCard className="mr-2 h-4 w-4 text-brand-deep-pitch-500" />
            <span>Upgrade Plan (Founder Pro)</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect('/settings')}>
            <Settings className="mr-2 h-4 w-4 text-slate-500" />
            <span>Account Settings</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export default CommandPalette;
