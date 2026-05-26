export default function CaseCardSkeleton() {
  return (
    <div className="bg-surface/60 border border-divider rounded-[1.5rem] overflow-hidden animate-pulse">
      {/* Thumbnail placeholder */}
      <div className="h-36 bg-surface-2/60" />
      <div className="p-4 space-y-3">
        {/* Title */}
        <div className="h-4 bg-surface-2 rounded-full w-3/4" />
        {/* Sub line */}
        <div className="h-3 bg-surface-2/70 rounded-full w-1/2" />
        {/* Badge row */}
        <div className="flex gap-2 pt-1">
          <div className="h-5 bg-surface-2 rounded-full w-20" />
          <div className="h-5 bg-surface-2 rounded-full w-16" />
        </div>
        {/* Action area */}
        <div className="h-9 bg-surface-2/60 rounded-2xl w-full mt-2" />
      </div>
    </div>
  );
}

export function CaseCardSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <CaseCardSkeleton key={i} />
      ))}
    </div>
  );
}
