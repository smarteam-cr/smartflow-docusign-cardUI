/**
 * A DocuSign template, as returned by GET /api/v1/docusign/templates.
 */
export interface Template {
  id: string;
  name: string;
}

/**
 * A HubSpot contact associated to the Deal, as returned by
 * GET /api/v1/hubspot/deals/:dealId/contacts.
 */
export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  docIdentificacion: string;
}

/**
 * Result of POST /api/v1/docusign/envelopes.
 */
export interface SendEnvelopeResult {
  envelopeId: string;
  status: string;
  recipientEmail: string;
}

export interface EnvelopeStatus {
  envelopeId: string | null;
  status: string;
  sentAt: string | null;
  signedAt: string | null;
  pdfUrl: string | null;
}

/**
 * Discriminated union for the card's UI state. TypeScript guarantees that
 * inside each branch you can only access the fields valid for that branch.
 *
 * State machine:
 *
 *   loading ──► ready ──► sending ──► active
 *      │         │           │
 *      ├──► active  ▼           ▼
 *      ├──► signed  ready     sendError ──► (back to ready via re-select)
 *      ├──► failed                     └──► sending (retry)
 *      ▼
 *   loadError
 */
export type UiState =
  | { kind: 'loading' }
  | {
      kind: 'ready';
      templates: Template[];
      contacts: Contact[];
      selectedTemplateId: string | null;
      selectedContactId: string | null;
    }
  | { kind: 'loadError'; message: string }
  | {
      kind: 'sending';
      templates: Template[];
      contacts: Contact[];
      selectedTemplateId: string;
      selectedContactId: string;
    }
  | {
      kind: 'sendError';
      templates: Template[];
      contacts: Contact[];
      selectedTemplateId: string;
      selectedContactId: string;
      message: string;
    }
  | {
      kind: 'active';
      envelopeId: string;
      dealId: string;
      status: string;
      sentAt: string | null;
    }
  | {
      kind: 'signed';
      envelopeId: string;
      signedAt: string | null;
      pdfUrl: string | null;
    }
  | {
      kind: 'failed';
      envelopeId: string;
      status: string;
    };
