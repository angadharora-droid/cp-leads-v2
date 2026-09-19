import { cn } from '@/lib/utils';
import { stageInfo } from '@/lib/enquiryStages';

/**
 * Colored pill for an enquiry's pipeline stage (hex + alpha styling so it
 * reads correctly in both light and dark themes).
 *
 * @param {object} props
 * @param {string} props.stage
 * @param {string} [props.className]
 */
function StageBadge({ stage, className }) {
  const info = stageInfo(stage);
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

export { StageBadge };
export default StageBadge;
