import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp, TrendingDown, Minus,
  ChevronDown, ChevronUp, RefreshCw, BarChart2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useMarket } from "../../hooks/useMarket";

// ─── Sub-components ──────────────────────────────────────────────────────────

function ChangeBadge({ pct }) {
  if (pct == null) return null;
  const abs = Math.abs(pct);
  const isPos = pct > 0.005;
  const isNeg = pct < -0.005;
  const Icon = isPos ? TrendingUp : isNeg ? TrendingDown : Minus;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${
        isPos ? "text-green-500" : isNeg ? "text-red-500" : "text-[var(--color-text-tertiary)]"
      }`}
    >
      <Icon size={10} strokeWidth={2.5} />
      {abs.toFixed(2)}%
    </span>
  );
}

function CurrencyCard({ code, name, rate }) {
  return (
    <div className="flex flex-col gap-1 p-3 rounded-xl bg-[var(--color-surface2)] min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
          {code}
        </span>
        <span className="text-[9px] text-[var(--color-text-tertiary)] truncate hidden sm:inline">/PKR</span>
      </div>
      <span className="text-sm font-bold text-[var(--color-text)] tabular-nums">
        ₨{rate.toFixed(2)}
      </span>
      <span className="text-[10px] text-[var(--color-text-tertiary)] truncate">{name}</span>
    </div>
  );
}

function StockCard({ stock }) {
  const isPos = (stock.changePct ?? 0) > 0.005;
  const isNeg = (stock.changePct ?? 0) < -0.005;
  return (
    <div className="flex flex-col gap-1 p-3 rounded-xl bg-[var(--color-surface2)] min-w-0">
      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] truncate">
        {stock.name}
      </span>
      <span className="text-sm font-bold text-[var(--color-text)] tabular-nums">
        {stock.currency === "USD" || stock.currency === "GBp" ? "" : ""}
        {stock.price != null
          ? stock.price.toLocaleString(undefined, { maximumFractionDigits: 2 })
          : "—"}
      </span>
      <ChangeBadge pct={stock.changePct} />
    </div>
  );
}

function MetalCard({ metal, label, usdPerPkr }) {
  if (!metal) return (
    <div className="flex flex-col gap-1 p-3 rounded-xl bg-[var(--color-surface2)] animate-pulse min-w-0">
      <div className="h-3 w-12 bg-[var(--color-border)] rounded" />
      <div className="h-4 w-16 bg-[var(--color-border)] rounded" />
    </div>
  );

  const pkrPrice = usdPerPkr && metal.price ? metal.price * usdPerPkr : null;

  return (
    <div className="flex flex-col gap-1 p-3 rounded-xl bg-[var(--color-surface2)] min-w-0">
      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
        {label}
      </span>
      <span className="text-sm font-bold text-[var(--color-text)] tabular-nums">
        ${metal.price?.toFixed(2) ?? "—"}<span className="text-[10px] font-normal text-[var(--color-text-tertiary)]">/oz</span>
      </span>
      {pkrPrice && (
        <span className="text-[10px] text-[var(--color-text-tertiary)] tabular-nums">
          ≈ ₨{Math.round(pkrPrice).toLocaleString()}
        </span>
      )}
      <ChangeBadge pct={metal.changePct} />
    </div>
  );
}

// Skeleton loader
function GridSkeleton({ cols = 6 }) {
  return (
    <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="h-[76px] rounded-xl bg-[var(--color-surface2)] animate-pulse" />
      ))}
    </div>
  );
}

// ─── Tab definitions ─────────────────────────────────────────────────────────
const TABS = [
  { id: "forex",   label: "💱 Forex",   title: "Exchange Rates to PKR" },
  { id: "indices", label: "📈 Indices", title: "Global Stock Indices"  },
  { id: "metals",  label: "🏅 Metals",  title: "Precious Metals (USD/oz)" },
];

// ─── Main component ───────────────────────────────────────────────────────────
export default function MarketStrip({ defaultOpen = true }) {
  const [isOpen, setIsOpen]   = useState(defaultOpen);
  const [activeTab, setTab]   = useState("forex");
  const { data: market, isLoading, isError, refetch, isFetching } = useMarket();

  // Don't render at all if market fails and we have no data
  if (isError && !market) return null;

  const currencies = market?.currencies ?? {};
  const stocks     = market?.stocks     ?? [];
  const metals     = market?.metals     ?? {};
  const updatedAt  = market?.updatedAt;
  const usdRate    = currencies.USD?.rate; // PKR per 1 USD

  const currencyList = Object.values(currencies);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 card overflow-hidden"
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={() => setIsOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <BarChart2 size={16} className="text-[var(--color-text-secondary)]" />
          <span className="text-sm font-bold text-[var(--color-text)]">Markets</span>
          {updatedAt && !isLoading && (
            <span className="text-xs text-[var(--color-text-tertiary)] hidden sm:inline">
              · updated {formatDistanceToNow(new Date(updatedAt), { addSuffix: true })}
            </span>
          )}
          {isFetching && (
            <span className="text-[10px] text-brand-blue animate-pulse font-medium">Updating…</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); refetch(); }}
            title="Refresh market data"
            className={`p-1.5 rounded-full hover:bg-[var(--color-surface2)] text-[var(--color-text-tertiary)] transition-colors ${isFetching ? "animate-spin" : ""}`}
          >
            <RefreshCw size={12} />
          </button>
          {isOpen
            ? <ChevronUp size={15} className="text-[var(--color-text-tertiary)]" />
            : <ChevronDown size={15} className="text-[var(--color-text-tertiary)]" />
          }
        </div>
      </div>

      {/* ── Collapsible body ── */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            {/* Tab bar */}
            <div className="flex items-center gap-2 px-4 pb-3 border-b border-[var(--color-border)] overflow-x-auto hide-scrollbar">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${
                    activeTab === t.id
                      ? "bg-[var(--color-text)] text-[var(--color-bg)]"
                      : "bg-[var(--color-surface2)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="p-4">
              <AnimatePresence mode="wait">
                {/* FOREX */}
                {activeTab === "forex" && (
                  <motion.div
                    key="forex"
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 4 }}
                    transition={{ duration: 0.15 }}
                  >
                    {isLoading ? (
                      <GridSkeleton cols={6} />
                    ) : currencyList.length > 0 ? (
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                        {currencyList.map((c) => (
                          <CurrencyCard key={c.code} code={c.code} name={c.name} rate={c.rate} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-[var(--color-text-tertiary)] text-center py-4">
                        Exchange rates unavailable
                      </p>
                    )}
                  </motion.div>
                )}

                {/* INDICES */}
                {activeTab === "indices" && (
                  <motion.div
                    key="indices"
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 4 }}
                    transition={{ duration: 0.15 }}
                  >
                    {isLoading ? (
                      <GridSkeleton cols={5} />
                    ) : stocks.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        {stocks.map((s) => (
                          <StockCard key={s.symbol} stock={s} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-[var(--color-text-tertiary)] text-center py-4">
                        Market data unavailable
                      </p>
                    )}
                  </motion.div>
                )}

                {/* METALS */}
                {activeTab === "metals" && (
                  <motion.div
                    key="metals"
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 4 }}
                    transition={{ duration: 0.15 }}
                  >
                    {isLoading ? (
                      <GridSkeleton cols={2} />
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-sm">
                        <MetalCard
                          metal={metals.gold}
                          label="🥇 Gold"
                          usdPerPkr={usdRate}
                        />
                        <MetalCard
                          metal={metals.silver}
                          label="🥈 Silver"
                          usdPerPkr={usdRate}
                        />
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
