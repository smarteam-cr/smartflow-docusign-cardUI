import { hubspot } from '@hubspot/ui-extensions';
import type { Contact, Template, SendEnvelopeResult, EnvelopeStatus } from '../types.js';

/**
 * Dummy HTTPS URL that the HubSpot CLI proxies to http://localhost:3000 in dev
 * (via local.json in src/app/). In production this constant is replaced with
 * the real backend domain.
 *
 * MUST stay listed in app-hsmeta.json's permittedUrls.fetch.
 */
const API_BASE = 'https://api.docusign-integration.local';

interface BackendErrorBody {
  error?: string;
  message?: string;
  details?: unknown;
  requestId?: string;
}

async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as BackendErrorBody;
    return body.message ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * GET /api/v1/docusign/templates → list of DocuSign templates.
 * @throws Error with a user-friendly message on failure.
 */
export async function fetchTemplates(): Promise<Template[]> {
  const res = await hubspot.fetch(`${API_BASE}/api/v1/docusign/templates`, {
    method: 'GET',
  });

  if (!res.ok) {
    const msg = await extractErrorMessage(res, 'No pudimos cargar los documentos');
    throw new Error(msg);
  }

  const body = (await res.json()) as { templates?: Template[] };
  return body.templates ?? [];
}

/**
 * GET /api/v1/hubspot/deals/:dealId/contacts → contacts associated to the Deal.
 * @throws Error with a user-friendly message on failure.
 */
export async function fetchContacts(dealId: string): Promise<Contact[]> {
  const res = await hubspot.fetch(
    `${API_BASE}/api/v1/hubspot/deals/${encodeURIComponent(dealId)}/contacts`,
    { method: 'GET' }
  );

  if (!res.ok) {
    const msg = await extractErrorMessage(res, 'No pudimos cargar los contactos del Deal');
    throw new Error(msg);
  }

  const body = (await res.json()) as { contacts?: Contact[] };
  return body.contacts ?? [];
}

/**
 * POST /api/v1/docusign/envelopes → triggers backend to send a DocuSign envelope
 * to the chosen contact, using the chosen template.
 * @throws Error with a user-friendly message on failure.
 */
export async function sendEnvelope(input: {
  dealId: string;
  templateId: string;
  contactId: string;
}): Promise<SendEnvelopeResult> {
  const res = await hubspot.fetch(`${API_BASE}/api/v1/docusign/envelopes`, {
    method: 'POST',
    body: input,
  });

  if (!res.ok) {
    const msg = await extractErrorMessage(res, 'No pudimos enviar el documento');
    throw new Error(msg);
  }

  return (await res.json()) as SendEnvelopeResult;
}

export async function fetchEnvelopeStatus(dealId: string): Promise<EnvelopeStatus> {
  const res = await hubspot.fetch(
    `${API_BASE}/api/v1/deals/${encodeURIComponent(dealId)}/envelope-status`,
    { method: 'GET' }
  );

  if (!res.ok) {
    const msg = await extractErrorMessage(res, 'No pudimos cargar el estado del contrato');
    throw new Error(msg);
  }

  return (await res.json()) as EnvelopeStatus;
}
