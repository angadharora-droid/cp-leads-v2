function pad2(n) {
  return String(n).padStart(2, '0');
}

function ddmmyy(date) {
  const d = date instanceof Date ? date : new Date(date);
  const valid = Number.isNaN(d.getTime()) ? new Date() : d;
  const dd = pad2(valid.getDate());
  const mm = pad2(valid.getMonth() + 1);
  const yy = String(valid.getFullYear()).slice(-2);
  return `${dd}${mm}${yy}`;
}

export async function generateLeadReference(city, leadDate, LeadModel) {
  const cityCode =
    (city || 'NA').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'NA';
  const datePart = ddmmyy(leadDate || new Date());
  const prefix = `CPH-${cityCode}-${datePart}-`;

  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escaped}\\d{3}$`);

  const existing = await LeadModel.find({ reference: regex })
    .select('reference')
    .lean();

  let max = 0;
  for (const doc of existing) {
    const seq = parseInt(doc.reference.slice(prefix.length), 10);
    if (Number.isFinite(seq) && seq > max) max = seq;
  }

  const next = String(max + 1).padStart(3, '0');
  return `${prefix}${next}`;
}

export default generateLeadReference;
