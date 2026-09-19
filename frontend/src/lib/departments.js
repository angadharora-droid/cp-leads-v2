/**
 * Helpers for a company lead's structure: Company → Branch → Department.
 * Departments live on the lead as `departments: [{ _id, branch, name }]`;
 * enquiries and rate contracts reference a node by its _id.
 */

export const LEAD_TYPE_LABELS = { company: 'Company', individual: 'Individual' };

/** Leads saved before lead types existed are companies. */
export function isIndividual(lead) {
  return lead?.leadType === 'individual';
}

/** "Branch · Department", or just "Department" when the node has no branch. */
export function nodeLabel(node) {
  if (!node) return '';
  return node.branch ? `${node.branch} · ${node.name}` : node.name || '';
}

/** Label for the node with the given id on a lead ('' when not found). */
export function departmentLabel(lead, departmentId) {
  if (!departmentId) return '';
  const id = typeof departmentId === 'object' ? departmentId._id : departmentId;
  const node = (lead?.departments || []).find((d) => String(d._id) === String(id));
  return nodeLabel(node);
}

/** Label used for nodes that sit directly under the company (no branch). */
export const NO_BRANCH_LABEL = 'Head office';

/**
 * Groups a lead's departments by branch, keeping first-seen order. Nodes
 * without a branch come first under NO_BRANCH_LABEL.
 * @returns {Array<{ branch: string, label: string, nodes: Array }>}
 */
export function groupByBranch(departments) {
  const groups = new Map();
  for (const node of departments || []) {
    const branch = (node.branch || '').trim();
    if (!groups.has(branch)) groups.set(branch, []);
    groups.get(branch).push(node);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => {
    if (a === '' && b !== '') return -1;
    if (b === '' && a !== '') return 1;
    return 0;
  });
  return ordered.map(([branch, nodes]) => ({
    branch,
    label: branch || NO_BRANCH_LABEL,
    nodes,
  }));
}

/** True when at least one department has a branch set. */
export function hasBranches(departments) {
  return (departments || []).some((d) => (d.branch || '').trim());
}
