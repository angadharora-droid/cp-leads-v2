/*
 * Client message bodies for the enquiry flow, copied from the house
 * templates ("Email Body" HCP.M.* and "Whats App Body" HCP.WA.*). Only the
 * salutation, the event type and the sign-off are filled in; the wording is
 * left exactly as written in the templates.
 */

const HOTEL = 'Hotel Centre Point';

/** "Dear Mr./Ms. <Last Name>," — the templates address the client by surname. */
export function salutation(contactName) {
  const parts = String(contactName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'Dear Sir/Madam,';
  return `Dear Mr./Ms. ${parts[parts.length - 1]},`;
}

function signOff(senderName, closing = 'Warm regards,') {
  return `${closing}\n${senderName ? `${senderName}\n` : ''}${HOTEL}`;
}

function eventType(enquiry) {
  const names = [
    ...new Set((enquiry.functions || []).map((fn) => fn.functionType?.name || fn.name).filter(Boolean)),
  ];
  return names.length ? names.join(' / ') : 'Conference / Residential Conference / Social Event';
}

/* --------------------------------- Email ---------------------------------- */

// HCP.M.EP
export function proposalEmail({ enquiry, senderName }) {
  return [
    salutation(enquiry.contactName),
    '',
    'Greetings from Centre Point Hospitality!',
    '',
    `We appreciate your trust in Hotel Centre Point and look forward to providing you with a memorable experience. Please find attached the proposal for your upcoming ${eventType(enquiry)}. The document has been carefully prepared based on the requirements shared with us and outlines the proposed arrangements, along with the relevant facilities, inclusions, and commercial terms.`,
    '',
    'Kindly review the proposal at your convenience and feel free to reach out should you require any clarification or further customization. We would be pleased to tailor the arrangements to best suit your requirements.',
    '',
    'We sincerely value the opportunity to host you and your esteemed guests and look forward to your favorable response.',
    '',
    signOff(senderName),
  ].join('\n');
}

// HCP.M.EC — the pro-forma invoice goes out in the same email, so one line
// (in the wording of HCP.M.PFI) says so.
export function contractEmail({ enquiry, senderName }) {
  const pfi = enquiry.proforma?.number ? `Pro-Forma Invoice ${enquiry.proforma.number}` : 'Pro-Forma Invoice';
  return [
    salutation(enquiry.contactName),
    '',
    'Greetings from Centre Point Hospitality!',
    '',
    'We truly appreciate the opportunity to be associated with you. Further to our recent discussions, please find attached the Agreement for your review and necessary action. The document outlines the mutually agreed terms and conditions & commercials.',
    '',
    `The ${pfi} is also attached, issued for processing the advance payment towards confirmation of the reservation. Upon receipt of the advance payment, the booking will be confirmed accordingly.`,
    '',
    'We kindly request you to review the same and share the duly signed copy at your convenience for our records.',
    '',
    'Should you require any clarification, please feel free to reach out.',
    '',
    signOff(senderName, 'Warm Regards,'),
  ].join('\n');
}

// HCP.M.PFI
export function proformaEmail({ enquiry, senderName }) {
  return [
    salutation(enquiry.contactName),
    '',
    'Greetings from Centre Point Hospitality!',
    '',
    'We thank you for choosing Hotel Centre Point. Further to our discussion, please find attached the Pro-Forma Invoice for your reference. The document outlines the applicable charges and reservation details as discussed, including the estimated billing for the proposed stay / event along with the applicable taxes and payment terms.',
    '',
    'Kindly review the invoice and note that the same has been issued for your reference and for processing the advance payment towards confirmation of the reservation. Upon receipt of the advance payment, the booking will be confirmed accordingly.',
    '',
    'Should you require any clarification or further assistance, please feel free to contact us.',
    '',
    signOff(senderName, 'Warm Regards,'),
  ].join('\n');
}

// Addendum to the agreement (no house template — written in the same voice).
export function addendumEmail({ enquiry, senderName }) {
  const addendum = latestAddendum(enquiry);
  const ref = addendum?.number ? `Addendum ${addendum.number}` : 'the Addendum';
  const contract = enquiry.contract?.number ? ` to the Agreement ${enquiry.contract.number}` : ' to the Agreement';
  const pfi = enquiry.proforma?.number ? `The revised Pro-Forma Invoice ${enquiry.proforma.number}` : 'The revised Pro-Forma Invoice';
  return [
    salutation(enquiry.contactName),
    '',
    'Greetings from Centre Point Hospitality!',
    '',
    `Further to your request, please find attached ${ref}${contract}, recording the changes to the arrangements as discussed. ${pfi} reflecting these changes is also attached.`,
    '',
    'We kindly request you to review the same and share the duly signed copy at your convenience for our records. Except for the changes recorded in the Addendum, all other terms and conditions of the original Agreement remain unchanged.',
    '',
    'Should you require any clarification, please feel free to reach out.',
    '',
    signOff(senderName, 'Warm Regards,'),
  ].join('\n');
}

/* -------------------------------- WhatsApp -------------------------------- */

// HCP.WA.EP
export function proposalWhatsApp({ enquiry, senderName }) {
  return [
    salutation(enquiry.contactName),
    '',
    'Greetings from Centre Point Hospitality!',
    '',
    `We appreciate your trust in Hotel Centre Point and look forward to providing you with a memorable experience. Please find attached the Event Proposal for your upcoming ${eventType(enquiry)}. Kindly review the details and feel free to reach out for any clarification.`,
    '',
    signOff(senderName),
  ].join('\n');
}

// HCP.WA.EC
export function contractWhatsApp({ enquiry, senderName }) {
  return [
    salutation(enquiry.contactName),
    '',
    'Greetings from Centre Point Hospitality!',
    '',
    'We truly appreciate the opportunity to be associated with you. Please find attached the Contract for your review. Kindly share the signed copy at your convenience.',
    '',
    signOff(senderName, 'Warm Regards,'),
  ].join('\n');
}

// HCP.WA.PFI
export function proformaWhatsApp({ enquiry, senderName }) {
  return [
    salutation(enquiry.contactName),
    '',
    'Greetings from Centre Point Hospitality!',
    '',
    'We thank you for choosing Hotel Centre Point. Please find attached the Pro-Forma Invoice for your reference. The document outlines the estimated charges and payment details for the proposed reservation.',
    '',
    signOff(senderName, 'Warm Regards,'),
  ].join('\n');
}

export function addendumWhatsApp({ enquiry, senderName }) {
  const addendum = latestAddendum(enquiry);
  const ref = addendum?.number ? `Addendum ${addendum.number}` : 'the Addendum';
  return [
    salutation(enquiry.contactName),
    '',
    'Greetings from Centre Point Hospitality!',
    '',
    `Please find attached ${ref} to the Agreement recording the changes as discussed, along with the revised Pro-Forma Invoice. Kindly share the signed copy at your convenience.`,
    '',
    signOff(senderName, 'Warm Regards,'),
  ].join('\n');
}

/* --------------------------------- Lookup --------------------------------- */

function latestAddendum(enquiry) {
  const list = enquiry.addendums || [];
  return list.length ? list[list.length - 1] : null;
}

const MESSAGES = {
  proposal: { email: proposalEmail, whatsapp: proposalWhatsApp, label: 'Proposal' },
  contract: { email: contractEmail, whatsapp: contractWhatsApp, label: 'Contract' },
  proforma: { email: proformaEmail, whatsapp: proformaWhatsApp, label: 'Pro-Forma Invoice' },
  addendum: { email: addendumEmail, whatsapp: addendumWhatsApp, label: 'Addendum' },
};

export const MESSAGE_KINDS = Object.keys(MESSAGES);

/** Subject + email body + WhatsApp text for one document of an enquiry. */
export function messagesFor(kind, { enquiry, lead, senderName }) {
  const entry = MESSAGES[kind];
  if (!entry) return null;
  const number =
    kind === 'proposal'
      ? enquiry.proposal?.number
      : kind === 'contract'
        ? enquiry.contract?.number
        : kind === 'addendum'
          ? latestAddendum(enquiry)?.number
          : enquiry.proforma?.number;
  const subject = `${entry.label}${number ? ` ${number}` : ''} — ${lead?.businessName || ''} — ${HOTEL}`;
  const company = String(lead?.businessName || 'Guest').replace(/[\\/:*?"<>|]/g, '');
  return {
    subject,
    email: entry.email({ enquiry, senderName }),
    whatsapp: entry.whatsapp({ enquiry, senderName }),
    // The PDF is built fresh when the email goes out; this is its name.
    attachment: {
      filename: `${entry.label} ${number || ''} - ${company}.pdf`.replace('  ', ' '),
      numbered: Boolean(number),
    },
  };
}

export default { salutation, messagesFor, MESSAGE_KINDS };
