"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ACTIVITY_OPTIONS,
  LIFE_STAGE_OPTIONS,
  SPECIES_OPTIONS,
  type PatientFormValues,
} from "@/lib/patient-form";

type Props = {
  idPrefix: string;
  values: PatientFormValues;
  disabled?: boolean;
  onChange: (patch: Partial<PatientFormValues>) => void;
};

export function PatientFormFields({ idPrefix, values, disabled, onChange }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-name`}>Кличка</Label>
        <Input
          id={`${idPrefix}-name`}
          value={values.name}
          onChange={(event) => onChange({ name: event.target.value })}
          disabled={disabled}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-species`}>Вид</Label>
        <Select
          value={values.species}
          onValueChange={(value) => onChange({ species: value as PatientFormValues["species"] })}
          disabled={disabled}
        >
          <SelectTrigger id={`${idPrefix}-species`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SPECIES_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-breed`}>Порода</Label>
        <Input
          id={`${idPrefix}-breed`}
          value={values.breed}
          onChange={(event) => onChange({ breed: event.target.value })}
          disabled={disabled}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-weight`}>Вес, кг</Label>
        <Input
          id={`${idPrefix}-weight`}
          inputMode="decimal"
          value={values.body_weight_kg}
          onChange={(event) => onChange({ body_weight_kg: event.target.value })}
          disabled={disabled}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-adult-weight`}>Ожидаемый вес взрослого, кг</Label>
        <Input
          id={`${idPrefix}-adult-weight`}
          inputMode="decimal"
          value={values.expected_adult_weight_kg}
          onChange={(event) => onChange({ expected_adult_weight_kg: event.target.value })}
          disabled={disabled}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-birth`}>Дата рождения</Label>
        <Input
          id={`${idPrefix}-birth`}
          type="date"
          value={values.birth_date}
          onChange={(event) => onChange({ birth_date: event.target.value })}
          disabled={disabled}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-bcs`}>BCS (1–9)</Label>
        <Select
          value={values.bcs || "none"}
          onValueChange={(value) => onChange({ bcs: value === "none" ? "" : value })}
          disabled={disabled}
        >
          <SelectTrigger id={`${idPrefix}-bcs`}>
            <SelectValue placeholder="Не указан" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Не указан</SelectItem>
            {Array.from({ length: 9 }, (_, index) => String(index + 1)).map((score) => (
              <SelectItem key={score} value={score}>
                {score}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-life-stage`}>Жизненная стадия</Label>
        <Select
          value={values.life_stage || "none"}
          onValueChange={(value) => onChange({ life_stage: value === "none" ? "" : value })}
          disabled={disabled}
        >
          <SelectTrigger id={`${idPrefix}-life-stage`}>
            <SelectValue placeholder="Не указана" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Не указана</SelectItem>
            {LIFE_STAGE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-activity`}>Активность</Label>
        <Select
          value={values.activity || "none"}
          onValueChange={(value) => onChange({ activity: value === "none" ? "" : value })}
          disabled={disabled}
        >
          <SelectTrigger id={`${idPrefix}-activity`}>
            <SelectValue placeholder="Не указана" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Не указана</SelectItem>
            {ACTIVITY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-3 sm:col-span-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={values.neutered}
            onCheckedChange={(checked) => onChange({ neutered: checked === true })}
            disabled={disabled}
          />
          Кастрирован / стерилизован
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={values.pregnant}
            onCheckedChange={(checked) => onChange({ pregnant: checked === true })}
            disabled={disabled}
          />
          Беременность
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={values.lactating}
            onCheckedChange={(checked) => onChange({ lactating: checked === true })}
            disabled={disabled}
          />
          Лактация
        </label>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-lactation-week`}>Неделя лактации</Label>
        <Input
          id={`${idPrefix}-lactation-week`}
          inputMode="numeric"
          value={values.lactation_week}
          onChange={(event) => onChange({ lactation_week: event.target.value })}
          disabled={disabled}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-litter`}>Размер помёта</Label>
        <Input
          id={`${idPrefix}-litter`}
          inputMode="numeric"
          value={values.litter_size}
          onChange={(event) => onChange({ litter_size: event.target.value })}
          disabled={disabled}
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-allergies`}>Аллергии</Label>
        <Input
          id={`${idPrefix}-allergies`}
          value={values.allergies}
          onChange={(event) => onChange({ allergies: event.target.value })}
          disabled={disabled}
          placeholder="Через запятую"
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-chronic`}>Хронические состояния</Label>
        <Input
          id={`${idPrefix}-chronic`}
          value={values.chronic_conditions}
          onChange={(event) => onChange({ chronic_conditions: event.target.value })}
          disabled={disabled}
          placeholder="Через запятую"
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-feeding`}>Кормление</Label>
        <Input
          id={`${idPrefix}-feeding`}
          value={values.feeding_notes}
          onChange={(event) => onChange({ feeding_notes: event.target.value })}
          disabled={disabled}
          placeholder="Текущий рацион, лакомства, ограничения"
        />
      </div>
    </div>
  );
}

export function ClientContactFields({
  idPrefix,
  name,
  email,
  phone,
  disabled,
  onChange,
}: {
  idPrefix: string;
  name: string;
  email: string;
  phone: string;
  disabled?: boolean;
  onChange: (patch: { name?: string; email?: string; phone?: string }) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-client-name`}>Имя клиента</Label>
        <Input
          id={`${idPrefix}-client-name`}
          value={name}
          onChange={(event) => onChange({ name: event.target.value })}
          disabled={disabled}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-phone`}>Телефон</Label>
        <Input
          id={`${idPrefix}-phone`}
          value={phone}
          onChange={(event) => onChange({ phone: event.target.value })}
          disabled={disabled}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-email`}>Email</Label>
        <Input
          id={`${idPrefix}-email`}
          type="email"
          value={email}
          onChange={(event) => onChange({ email: event.target.value })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
