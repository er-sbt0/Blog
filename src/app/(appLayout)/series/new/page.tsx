import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NewSeriesForm } from "@/components/SeriesActions";

// Force dynamic rendering to ensure session is checked on every request
export const dynamic = "force-dynamic";

export default async function NewSeriesPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/api/auth/signin");
  }

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <NewSeriesForm />
    </div>
  );
}
