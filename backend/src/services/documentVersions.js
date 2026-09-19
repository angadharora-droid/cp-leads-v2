export const VERSIONED_DOCUMENTS = ['proposal', 'contract', 'proforma'];

/** Older issues get stable numbers from their append-only order. */
export function numberedIssues(issues = []) {
  const counts = {};
  return issues.map((entry) => {
    const issue = entry.toObject ? entry.toObject() : entry;
    const version = Math.max((counts[issue.document] || 0) + 1, Number(issue.version) || 0);
    counts[issue.document] = version;
    return { ...issue, version };
  });
}

export function currentDocumentVersion(enquiry, document) {
  const previous = numberedIssues(enquiry.issues).filter((issue) => issue.document === document);
  return Math.max(Number(enquiry[document]?.version) || 1, (previous.at(-1)?.version || 0) + 1);
}

export function withDocumentVersions(enquiry) {
  const plain = enquiry.toObject ? enquiry.toObject() : enquiry;
  return {
    ...plain,
    issues: numberedIssues(plain.issues),
    ...Object.fromEntries(VERSIONED_DOCUMENTS.map((kind) => [kind, {
      ...plain[kind], version: currentDocumentVersion(plain, kind),
    }])),
  };
}
