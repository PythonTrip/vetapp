import { JoinForm } from "@/features/owner-cabinet/components/join-form";
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JoinForm key={code} code={code} />;
}
