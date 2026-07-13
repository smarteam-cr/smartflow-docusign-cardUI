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
/**
 * Sentinel value for `selectedDirectionId` meaning the seller chose to type
 * the location manually instead of picking one of the company's direcciones.
 */
export const CUSTOM_LOCATION = '__custom__';

/** Countries offered in the "País" dropdown; the selected text travels to the API as `country`. */
export const COUNTRIES = [
  'El Salvador',
  'Costa Rica',
  'Guatemala',
  'Honduras',
  'República Dominicana',
] as const;

export type UiState =
  | { kind: 'loading' }
  | {
      kind: 'ready';
      sendContext: SendContext;
      selectedTemplateId: string | null;
      selectedContactId: string | null;
      selectedDirectionId: string | null;
      selectedCountry: string | null;
      customLocation: string;
      legalRepresentative: string;
      dniLegalRepresentative: string;
    }
  | { kind: 'loadError'; message: string }
  | {
      kind: 'sending';
      sendContext: SendContext;
      selectedTemplateId: string;
      selectedContactId: string | null;
      selectedDirectionId: string | null;
      selectedCountry: string | null;
      customLocation: string;
      legalRepresentative: string;
      dniLegalRepresentative: string;
    }
  | {
      kind: 'sendError';
      sendContext: SendContext;
      selectedTemplateId: string;
      selectedContactId: string | null;
      selectedDirectionId: string | null;
      selectedCountry: string | null;
      customLocation: string;
      legalRepresentative: string;
      dniLegalRepresentative: string;
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
