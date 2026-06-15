// Command palette (⌘/Ctrl+K) for the merged sidebar. Phase 3: navigation only.
// Phase 5 extends it into a unified search across connections, loaded tables,
// and saved queries.
import { useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DialogTitle } from "@/components/ui/dialog";

export interface PaletteDest {
  to: string;
  label: string;
  icon: LucideIcon;
}

export default function CommandPalette({
  open,
  onOpenChange,
  destinations,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  destinations: PaletteDest[];
}) {
  const navigate = useNavigate();
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <DialogTitle className="sr-only">Command palette</DialogTitle>
      <CommandInput placeholder="Search pages…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {destinations.map((d) => (
            <CommandItem
              key={d.to}
              onSelect={() => {
                navigate({ to: d.to });
                onOpenChange(false);
              }}
            >
              <d.icon className="mr-2 h-4 w-4" />
              {d.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
