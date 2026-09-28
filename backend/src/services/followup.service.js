import mongoose from 'mongoose';
import Lead from '../models/Lead.js';
import Prospect from '../models/Prospect.js';

/**
 * Aggregate OPEN follow-ups and OPEN instructions across leads the current
 * user is allowed to see.
 *
 * Scoping:
 *  - admin       -> all leads
 *  - sales_exec  -> only leads where assignedTo === self
 *
 * Returns:
 *  {
 *    followUps: [{ leadId, reference, businessName, city, dueDate, note, status }],
 *    instructions: [{ leadId, reference, businessName, text, issuedAt }]
 *  }
 *
 * Follow-ups are sorted by dueDate (ascending). Instructions are sorted by
 * issuedAt (ascending).
 */
export async function getMyFollowUps(currentUser) {
  if (!currentUser || !currentUser.id) {
    return { followUps: [], instructions: [] };
  }

  const match = {};
  if (!['admin', 'manager'].includes(currentUser.role)) {
    match.assignedTo = new mongoose.Types.ObjectId(currentUser.id);
  }

  // Only consider leads that actually have at least one open follow-up or
  // open instruction, to keep the aggregation lean.
  const pipeline = [
    { $match: match },
    {
      $match: {
        $or: [
          { 'followUps.status': 'open' },
          { 'instructions.status': 'open' },
        ],
      },
    },
    {
      $project: {
        reference: 1,
        businessName: 1,
        city: 1,
        followUps: {
          $filter: {
            input: { $ifNull: ['$followUps', []] },
            as: 'fu',
            cond: { $eq: ['$$fu.status', 'open'] },
          },
        },
        instructions: {
          $filter: {
            input: { $ifNull: ['$instructions', []] },
            as: 'ins',
            cond: { $eq: ['$$ins.status', 'open'] },
          },
        },
      },
    },
  ];

  const leads = await Lead.aggregate(pipeline);

  const followUps = [];
  const instructions = [];

  for (const lead of leads) {
    const leadId = String(lead._id);
    const reference = lead.reference || '';
    const businessName = lead.businessName || '';
    const city = lead.city || '';

    for (const fu of lead.followUps || []) {
      followUps.push({
        leadId,
        enquiryId: fu.enquiry ? String(fu.enquiry) : null,
        followUpId: fu._id ? String(fu._id) : null,
        reference,
        businessName,
        city,
        dueDate: fu.dueDate || null,
        note: fu.note || '',
        status: fu.status || 'open',
      });
    }

    for (const ins of lead.instructions || []) {
      instructions.push({
        leadId,
        enquiryId: ins.enquiry ? String(ins.enquiry) : null,
        instructionId: ins._id ? String(ins._id) : null,
        reference,
        businessName,
        text: ins.text || '',
        issuedAt: ins.createdAt || null,
      });
    }
  }

  // Leads not yet linked to a company / individual keep their own follow-ups.
  const prospectMatch = { classifiedAt: { $exists: false }, 'followUps.status': 'open' };
  if (match.assignedTo) prospectMatch.assignedTo = match.assignedTo;
  const prospects = await Prospect.find(prospectMatch).select('name city followUps').lean();
  for (const prospect of prospects) {
    for (const fu of prospect.followUps || []) {
      if (fu.status !== 'open') continue;
      followUps.push({
        prospectId: String(prospect._id),
        leadId: null,
        enquiryId: null,
        followUpId: fu._id ? String(fu._id) : null,
        reference: 'New lead',
        businessName: prospect.name || '',
        city: prospect.city || '',
        dueDate: fu.dueDate || null,
        note: fu.note || '',
        status: 'open',
      });
    }
  }

  followUps.sort((a, b) => {
    const av = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
    const bv = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
    return av - bv;
  });

  instructions.sort((a, b) => {
    const av = a.issuedAt ? new Date(a.issuedAt).getTime() : Number.POSITIVE_INFINITY;
    const bv = b.issuedAt ? new Date(b.issuedAt).getTime() : Number.POSITIVE_INFINITY;
    return av - bv;
  });

  return { followUps, instructions };
}

export default { getMyFollowUps };
