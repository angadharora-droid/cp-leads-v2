/**
 * The annual rate contract (ARC) funnel. Like enquiries, stages advance
 * automatically from actions on the agreement kit — raise → generate
 * agreement → email it → upload the signed copy — and only `lost` is manual.
 */
export const ARC_STAGES = [
  {
    key: 'enquiry',
    label: 'Enquiry',
    color: '#64748b',
    hint: 'Rate contract raised — agreement not yet generated',
  },
  {
    key: 'proposal',
    label: 'Proposal',
    color: '#2563eb',
    hint: 'Rate agreement generated',
  },
  {
    key: 'awaiting',
    label: 'Awaiting signature',
    color: '#d97706',
    hint: 'Agreement emailed — awaiting the signed copy',
  },
  {
    key: 'contracted',
    label: 'Contracted',
    color: '#16a34a',
    hint: 'Signed agreement uploaded — contract in force',
  },
  {
    key: 'lost',
    label: 'Lost',
    color: '#dc2626',
    hint: 'Contract dropped',
  },
];

export const ARC_STAGE_MAP = Object.fromEntries(ARC_STAGES.map((s) => [s.key, s]));

export const ACTIVE_ARC_STAGE_KEYS = ['enquiry', 'proposal', 'awaiting', 'contracted'];

export function arcStageInfo(key) {
  return ARC_STAGE_MAP[key] || { key, label: key || 'Unknown', color: '#64748b', hint: '' };
}
