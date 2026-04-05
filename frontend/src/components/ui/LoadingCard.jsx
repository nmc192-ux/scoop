export default function LoadingCard({ className = "" }) {
  return (
    <div className={`card animate-pulse ${className}`}>
      <div className="shimmer-bg h-44 rounded-t-2xl" />
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="shimmer-bg h-4 w-16 rounded-full" />
          <div className="shimmer-bg h-4 w-20 rounded-full" />
        </div>
        <div className="space-y-2">
          <div className="shimmer-bg h-5 rounded-lg w-full" />
          <div className="shimmer-bg h-5 rounded-lg w-4/5" />
        </div>
        <div className="space-y-1.5">
          <div className="shimmer-bg h-3.5 rounded w-full" />
          <div className="shimmer-bg h-3.5 rounded w-3/4" />
        </div>
      </div>
    </div>
  );
}

export function LoadingGrid({ count = 6 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <LoadingCard key={i} />
      ))}
    </div>
  );
}

export function LoadingHero() {
  return (
    <div className="card animate-pulse mb-6">
      <div className="shimmer-bg h-64 sm:h-80 rounded-t-2xl" />
      <div className="p-6 space-y-4">
        <div className="flex gap-2">
          <div className="shimmer-bg h-6 w-24 rounded-full" />
          <div className="shimmer-bg h-6 w-16 rounded-full" />
        </div>
        <div className="space-y-2">
          <div className="shimmer-bg h-7 rounded-lg w-full" />
          <div className="shimmer-bg h-7 rounded-lg w-3/4" />
        </div>
        <div className="space-y-2">
          <div className="shimmer-bg h-4 rounded w-full" />
          <div className="shimmer-bg h-4 rounded w-full" />
          <div className="shimmer-bg h-4 rounded w-2/3" />
        </div>
      </div>
    </div>
  );
}
