import mongoose from 'mongoose';

import Lead, { LEAD_STATUSES } from '../models/Lead.js';

const { Types } = mongoose;

/**
 * Build a byStatus array that always includes every pipeline stage (count 0
 * when absent) and is ordered to match the canonical pipeline order.
 */
function normalizeByStatus(rows) {
  const counts = new Map(rows.map((r) => [r._id, r.count]));
  return LEAD_STATUSES.map((status) => ({
    status,
    count: counts.get(status) || 0,
  }));
}

/**
 * Admin dashboard: org-wide aggregates across all leads.
 */
export async function getAdminDashboard() {
  const [
    totalLeads,
    byStatusRaw,
    byCityRaw,
    byBusinessTypeRaw,
    byExecutiveRaw,
    recentLeads,
  ] = await Promise.all([
    Lead.countDocuments({}),

    Lead.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),

    Lead.aggregate([
      {
        $group: {
          _id: {
            $let: {
              vars: {
                trimmed: { $trim: { input: { $ifNull: ['$city', ''] } } },
              },
              in: {
                $cond: [{ $eq: ['$$trimmed', ''] }, 'Unspecified', '$$trimmed'],
              },
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 10 },
    ]),

    Lead.aggregate([
      {
        $group: {
          _id: {
            $let: {
              vars: {
                trimmed: {
                  $trim: { input: { $ifNull: ['$businessType', ''] } },
                },
              },
              in: {
                $cond: [{ $eq: ['$$trimmed', ''] }, 'Unspecified', '$$trimmed'],
              },
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 10 },
    ]),

    Lead.aggregate([
      { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      {
        $project: {
          _id: 0,
          executive: {
            $ifNull: [{ $arrayElemAt: ['$user.name', 0] }, 'Unassigned'],
          },
          count: 1,
        },
      },
      { $sort: { count: -1, executive: 1 } },
    ]),

    Lead.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .select('reference businessName city status assignedTo leadDate createdAt')
      .populate('assignedTo', 'name')
      .lean(),
  ]);

  const byStatus = normalizeByStatus(byStatusRaw);

  const byCity = byCityRaw.map((r) => ({ city: r._id, count: r.count }));
  const byBusinessType = byBusinessTypeRaw.map((r) => ({
    businessType: r._id,
    count: r.count,
  }));

  const contractedCount =
    byStatus.find((s) => s.status === 'Contracted')?.count || 0;
  const nonContractedCount =
    byStatus.find((s) => s.status === 'Non Contracted')?.count || 0;

  const conversionRate =
    totalLeads > 0 ? Math.round((contractedCount / totalLeads) * 1000) / 10 : 0;

  const recent = recentLeads.map((l) => ({
    _id: l._id,
    reference: l.reference,
    businessName: l.businessName,
    city: l.city || '',
    status: l.status,
    assignedTo: l.assignedTo
      ? { _id: l.assignedTo._id, name: l.assignedTo.name }
      : null,
    leadDate: l.leadDate,
    createdAt: l.createdAt,
  }));

  return {
    totalLeads,
    byStatus,
    byCity,
    byBusinessType,
    byExecutive: byExecutiveRaw,
    contractedCount,
    nonContractedCount,
    conversionRate,
    recentLeads: recent,
  };
}

/**
 * Personal dashboard for a sales executive: aggregates scoped to leads
 * assigned to the given user.
 */
export async function getMyDashboard(userId) {
  const assignedId = new Types.ObjectId(userId);
  const scope = { assignedTo: assignedId };

  const [byStatusRaw, totalLeads, openFollowUpsAgg, recentLeads] =
    await Promise.all([
      Lead.aggregate([
        { $match: scope },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      Lead.countDocuments(scope),

      Lead.aggregate([
        { $match: scope },
        { $unwind: '$followUps' },
        { $match: { 'followUps.status': 'open' } },
        { $count: 'count' },
      ]),

      Lead.find(scope)
        .sort({ updatedAt: -1 })
        .limit(10)
        .select('reference businessName history updatedAt')
        .lean(),
    ]);

  const byStatus = normalizeByStatus(byStatusRaw);
  const openFollowUps = openFollowUpsAgg[0]?.count || 0;

  // Flatten recent history entries across the exec's leads, newest first.
  const activities = [];
  for (const lead of recentLeads) {
    for (const h of lead.history || []) {
      activities.push({
        leadId: lead._id,
        reference: lead.reference,
        businessName: lead.businessName,
        type: h.type || '',
        summary: h.summary || '',
        at: h.at,
        byName: h.byName || '',
      });
    }
  }
  activities.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const recentActivity = activities.slice(0, 10);

  return {
    totalLeads,
    byStatus,
    openFollowUps,
    recentActivity,
  };
}

export default { getAdminDashboard, getMyDashboard };
