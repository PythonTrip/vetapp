import { JoinForm } from "@/components/owner/join-form";
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JoinForm key={code} code={code} />;
}
