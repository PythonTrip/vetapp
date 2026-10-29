import { Skeleton } from "@/components/ui/skeleton";

export default function AppContentLoading() {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 sm:p-6 lg:p-8" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-[28rem] w-full" />
    </div>
  );
}
