import mongoose from 'mongoose';
import Enquiry from '../models/Enquiry.js';
import Lead from '../models/Lead.js';

export const ACTIVITY_FIELDS = ['notes', 'followUps', 'visitReports', 'actionPoints', 'instructions'];

export function activityFor(lead, enquiryId = null) {
  const plain = lead.toObject ? lead.toObject() : lead;
  return Object.fromEntries(ACTIVITY_FIELDS.map((field) => [field,
    (plain[field] || []).filter((item) => String(item.enquiry || '') === String(enquiryId || '')),
  ]));
}

/** Assign older unlinked activity only when there is exactly one enquiry.
 * The assignment is atomic within the lead and preserves every activity ID.
 * Running it again leaves already-linked records untouched.
 */
export async function assignSingleEnquiryActivity(lead) {
  if (!ACTIVITY_FIELDS.some((field) => (lead[field] || []).some((item) => !item.enquiry))) return lead;
  const enquiries = await Enquiry.find({ lead: lead._id }).select('_id').limit(2).lean();
  if (enquiries.length !== 1) return lead;
  const enquiryId = new mongoose.Types.ObjectId(String(enquiries[0]._id));
  const fields = Object.fromEntries(ACTIVITY_FIELDS.map((field) => [field, {
    $map: {
      input: { $ifNull: [`$${field}`, []] }, as: 'item',
      in: { $cond: [
        { $eq: [{ $ifNull: ['$$item.enquiry', null] }, null] },
        { $mergeObjects: ['$$item', { enquiry: enquiryId }] },
        '$$item',
      ] },
    },
  }]));
  await Lead.updateOne({ _id: lead._id }, [{ $set: fields }]);
  return Lead.findById(lead._id);
}
