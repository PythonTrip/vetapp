"use client";

import * as React from "react";
import {
  Search, PawPrint, LayoutDashboard, Users, Calculator, BookOpen,
  FileText, Plus, Download, Moon, Sun, ArrowRight,
} from "lucide-react";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandShortcut, CommandSeparator,
} from "@/components/ui/command";
import { usePets } from "@/lib/hooks";
import { useAppStore, type ModuleId } from "@/lib/store";
import { useTheme } from "next-themes";
import { calculateAge, bcsDescription } from "@/lib/nutrition";
import { speciesAvatarClass } from "@/lib/clinical-data";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { data: pets } = usePets();
  const { setActiveModule, setActivePetId } = useAppStore();
  const { setTheme, theme } = useTheme();

  const go = (m: ModuleId) => {
    setActiveModule(m);
    onOpenChange(false);
  };

  const openPet = (id: string) => {
    setActivePetId(id);
    setActiveModule("crm");
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} className="max-w-xl">
      <CommandInput placeholder="Search patients, navigate, or run commands..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Quick Navigation */}
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => go("dashboard")}>
            <LayoutDashboard className="h-4 w-4 text-primary" />
            <span>Go to Dashboard</span>
            <CommandShortcut>Overview</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("crm")}>
            <Users className="h-4 w-4 text-primary" />
            <span>Go to Patients CRM</span>
            <CommandShortcut>Records</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("nutrition")}>
            <Calculator className="h-4 w-4 text-primary" />
            <span>Go to Nutritionist Assistant</span>
            <CommandShortcut>Calculators</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("knowledge")}>
            <BookOpen className="h-4 w-4 text-primary" />
            <span>Go to Knowledge Base</span>
            <CommandShortcut>Protocols</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Patient Search */}
        {pets && pets.length > 0 && (
          <CommandGroup heading="Patients">
            {pets.map((p) => {
              const age = calculateAge(p.birthDate);
              const bcsInfo = bcsDescription(p.bcs);
              return (
                <CommandItem
                  key={p.id}
                  value={`${p.name} ${p.breed} ${p.ownerName} ${p.species}`}
                  onSelect={() => openPet(p.id)}
                >
                  <div className={`flex h-7 w-7 items-center justify-center rounded-md shrink-0 ${speciesAvatarClass(p.species)}`}>
                    <PawPrint className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium truncate">{p.name}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {p.breed} · {age.label} · {p.currentWeight}kg · BCS {p.bcs} {bcsInfo.label}
                    </span>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 ml-auto text-muted-foreground shrink-0" />
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        <CommandSeparator />

        {/* Quick Actions */}
        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() => {
              setTheme(theme === "dark" ? "light" : "dark");
              onOpenChange(false);
            }}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            <span>Toggle {theme === "dark" ? "Light" : "Dark"} Mode</span>
          </CommandItem>
          <CommandItem onSelect={() => go("crm")}>
            <Plus className="h-4 w-4 text-emerald-600" />
            <span>Add New Patient</span>
            <CommandShortcut>CRM</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("crm")}>
            <FileText className="h-4 w-4 text-primary" />
            <span>Generate Consultation Report</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
