interface SkeletonProps {
  className?: string;
  lines?: number;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
  );
}

export function SkeletonText({ lines = 3 }: SkeletonProps) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={`h-4 ${i === lines - 1 ? "w-2/3" : "w-full"}`}
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6 space-y-3">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-3 w-1/4" />
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="bg-gray-50 border-b px-4 py-3">
        <div className="flex gap-4">
          {Array.from({ length: cols }, (_, i) => (
            <Skeleton key={i} className="h-3 w-20" />
          ))}
        </div>
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="px-4 py-3 flex gap-4">
            {Array.from({ length: cols }, (_, j) => (
              <Skeleton key={j} className="h-3 w-24" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
