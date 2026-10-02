import { loadPortfolio } from "@/app/actions/b2b-portfolio";
import { PortfolioBoard } from "@/components/b2b/portfolio-board";

export const dynamic = "force-dynamic";
export default async function PortfolioPage() {
  const result = await loadPortfolio();
  if (!result.ok)
    return (
      <p
        role="alert"
        className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-800"
      >
        {result.message}
      </p>
    );
  return <PortfolioBoard initial={result.data} />;
}
