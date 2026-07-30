"use client";

import * as React from "react";
import {
  PawPrint, LayoutDashboard, Users, Calculator, BookOpen,
  FileText, Plus, Moon, Sun, ArrowRight, Settings,
} from "lucide-react";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandShortcut, CommandSeparator,
} from "@/components/ui/command";
import { usePets } from "@/lib/hooks";
import { useTheme } from "next-themes";
import { calculateAge, bcsDescription } from "@/lib/nutrition";
import { speciesAvatarClass } from "@/lib/clinical-data";
import { useAppNavigation, type AppSection } from "@/lib/navigation";
import { useI18n } from "@/lib/i18n";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { data: pets } = usePets();
  const { goToSection, openPatient } = useAppNavigation();
  const { t } = useI18n();
  const { setTheme, theme } = useTheme();

  const go = (section: AppSection) => {
    goToSection(section);
    onOpenChange(false);
  };

  const openPet = (id: string) => {
    openPatient(id);
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} className="max-w-xl">
      <CommandInput placeholder={t("command.placeholder")} />
      <CommandList>
        <CommandEmpty>{t("command.empty")}</CommandEmpty>

        {/* Quick Navigation */}
        <CommandGroup heading={t("command.navigate")}>
          <CommandItem onSelect={() => go("dashboard")}>
            <LayoutDashboard className="h-4 w-4 text-primary" />
            <span>{t("command.goHome")}</span>
            <CommandShortcut>Overview</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("patients")}>
            <Users className="h-4 w-4 text-primary" />
            <span>{t("command.goPatients")}</span>
            <CommandShortcut>Records</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("nutrition")}>
            <Calculator className="h-4 w-4 text-primary" />
            <span>{t("command.goNutrition")}</span>
            <CommandShortcut>Calculators</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("knowledge")}>
            <BookOpen className="h-4 w-4 text-primary" />
            <span>{t("command.goKnowledge")}</span>
            <CommandShortcut>Protocols</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("settings")}>
            <Settings className="h-4 w-4 text-primary" />
            <span>{t("command.goSettings")}</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Patient Search */}
        {pets && pets.length > 0 && (
          <CommandGroup heading={t("command.patients")}>
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
        <CommandGroup heading={t("command.actions")}>
          <CommandItem
            onSelect={() => {
              setTheme(theme === "dark" ? "light" : "dark");
              onOpenChange(false);
            }}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            <span>Toggle {theme === "dark" ? "Light" : "Dark"} Mode</span>
          </CommandItem>
          <CommandItem onSelect={() => go("patients")}>
            <Plus className="h-4 w-4 text-emerald-600" />
            <span>Add New Patient</span>
            <CommandShortcut>CRM</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("patients")}>
            <FileText className="h-4 w-4 text-primary" />
            <span>Generate Consultation Report</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
