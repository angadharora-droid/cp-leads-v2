import { cn } from '@/lib/utils';
import { arcStageInfo } from '@/lib/arcStages';

/** Colored pill for a rate contract's funnel stage. */
function ArcStageBadge({ stage, className }) {
  const info = arcStageInfo(stage);
  return (
    <span
      title={info.hint}
      style={{
        backgroundColor: `${info.color}1f`,
        color: info.color,
        borderColor: `${info.color}40`,
      }}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        className
      )}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: info.color }}
        aria-hidden="true"
      />
      {info.label}
    </span>
  );
}

export { ArcStageBadge };
export default ArcStageBadge;
