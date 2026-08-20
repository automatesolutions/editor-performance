export function Header({ pullTimestamp }: { pullTimestamp: string }) {
  return (
    <div className="mb-2 flex flex-wrap items-start justify-between gap-6">
      <div>
        <div className="text-title font-extrabold tracking-[-0.01em]">Editor Performance</div>
        <div className="mt-1 text-sm+ text-muted">
          All accounts · refreshed daily · pulled {pullTimestamp}
        </div>
      </div>
      <div className="flex items-center gap-[10px] rounded-[10px] border border-card-border bg-card px-4 py-[10px] text-stat">
        <span className="inline-block h-2 w-2 rounded-full bg-positive" />
        <span className="text-muted-deep">Target beaten</span>
        <span className="ml-2 inline-block h-2 w-2 rounded-full bg-negative" />
        <span className="text-muted-deep">Below target</span>
      </div>
    </div>
  );
}
