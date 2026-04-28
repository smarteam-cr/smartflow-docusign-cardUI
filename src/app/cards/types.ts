/**
 * A DocuSign template, as returned by GET /api/v1/docusign/templates.
 */
export interface Template {
  id: string;
  name: string;
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
  | { kind: 'ready'; templates: Template[]; selected: string | null }
  | { kind: 'loadError'; message: string }
  | { kind: 'sending'; templates: Template[]; selected: string }
  | { kind: 'success'; recipientEmail: string }
  | { kind: 'sendError'; templates: Template[]; selected: string; message: string };
