import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

export function ContactFields({ values, disabled = false }: { values?: { name: string; email: string; phone: string }; disabled?: boolean }) {
  return <>
    <div className="space-y-2"><Label htmlFor="owner-name">Ваше имя</Label><Input id="owner-name" name="name" autoComplete="name" required maxLength={255} defaultValue={values?.name} disabled={disabled} /></div>
    <div className="space-y-2"><Label htmlFor="owner-email">Электронная почта</Label><Input id="owner-email" name="email" type="email" autoComplete="email" required maxLength={255} defaultValue={values?.email} disabled={disabled} /></div>
    <div className="space-y-2"><Label htmlFor="owner-phone">Телефон</Label><Input id="owner-phone" name="phone" type="tel" autoComplete="tel" required maxLength={64} defaultValue={values?.phone} disabled={disabled} /></div>
  </>;
}
