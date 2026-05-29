/**
 * A DocuSign template, as returned by GET /api/v1/docusign/templates.
 */
export interface Template {
  id: string;
  name: string;
}

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  docIdentificacion: string;
}

export interface Direccion {
  id: string;
  direction: string;
}

export interface Company {
  razonSocial: string;
  pais: string;
}

export interface SendContext {
  clienteMode: 'juridico' | 'dropdown' | 'multiple_juridicos_error';
  juridicoContact: Contact | null;
  contacts: Contact[];
  direcciones: Direccion[];
  templates: Template[];
  company: Company | null;
  capexCount: number;
  hasQuote: boolean;
}

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
      sendContext: SendContext;
      selectedTemplateId: string | null;
      selectedContactId: string | null;
      selectedDirectionId: string | null;
    }
  | { kind: 'loadError'; message: string }
  | {
      kind: 'sending';
      sendContext: SendContext;
      selectedTemplateId: string;
      selectedContactId: string;
      selectedDirectionId: string | null;
    }
  | {
      kind: 'sendError';
      sendContext: SendContext;
      selectedTemplateId: string;
      selectedContactId: string;
      selectedDirectionId: string | null;
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
