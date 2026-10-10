/**
 * Legally required photo credit (CC licences). Tiny and truncated on purpose:
 * it must be visible, not prominent.
 */
export function PhotoCredit({
  by,
  license,
  className = "text-ink-400",
}: {
  by?: string | null;
  license?: string | null;
  className?: string;
}) {
  if (!by && !license) return null;
  const text = `© ${[by, license].filter(Boolean).join(" · ")}`;
  return (
    <p title={text} className={`truncate text-[10px] leading-tight ${className}`}>
      {text}
    </p>
  );
}
