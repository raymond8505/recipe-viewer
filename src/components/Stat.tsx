/**
 * A static labeled value cell in the Time/Yield stats band (prep/cook/total
 * time, or a non-scalable servings yield).
 */
export default function Stat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="text-center">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
        {label}
      </p>
      {/* min-h matches ServingsControl's size-11 stepper row so values share a
          vertical center across cells (and the band height doesn't shift when
          servings switch between static and stepper). */}
      <p className="flex min-h-11 items-center justify-center font-semibold text-gray-900">
        {value}
      </p>
    </div>
  );
}
