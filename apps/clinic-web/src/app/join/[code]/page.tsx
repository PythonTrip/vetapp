import { JoinForm } from "@vetdietderm/owner-features/components/join-form";
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JoinForm key={code} code={code} />;
}
