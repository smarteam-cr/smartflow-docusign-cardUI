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
}

/**
 * Result of POST /api/v1/docusign/envelopes.
 */
export interface SendEnvelopeResult {
  envelopeId: string;
  status: string;
  recipientEmail: string;
}

/**
 * Discriminated union for the card's UI state. TypeScript guarantees that
 * inside each branch you can only access the fields valid for that branch.
 *
 * State machine:
 *
 *   loading ──► ready ──► sending ──► success
 *      │         │           │
 *      ▼         ▼           ▼
 *   loadError  ready     sendError ──► (back to ready via re-select)
 *                                  └──► sending (retry)
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
  | { kind: 'success'; recipientEmail: string }
  | {
      kind: 'sendError';
      templates: Template[];
      contacts: Contact[];
      selectedTemplateId: string;
      selectedContactId: string;
      message: string;
    };
