import { hubspot } from '@hubspot/ui-extensions';
import type { SendContext, SendEnvelopeResult, EnvelopeStatus } from '../types.js';

/**
 * Dummy HTTPS URL that the HubSpot CLI proxies to http://localhost:3002 in dev
 * (via local.json in src/app/). In production this constant is replaced with
 * the real backend domain.
 *
 * MUST stay listed in app-hsmeta.json's permittedUrls.fetch.
 */
//const API_BASE = 'https://api.docusign-integration.local';
const API_BASE = 'https://smartds.smarteamcr.com';

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

export async function fetchSendContext(dealId: string): Promise<SendContext> {
  const res = await hubspot.fetch(
    `${API_BASE}/api/v1/deals/${encodeURIComponent(dealId)}/send-context`,
    { method: 'GET' }
  );
  if (!res.ok) {
    const msg = await extractErrorMessage(res, 'No pudimos cargar el contexto de envío');
    throw new Error(msg);
  }
  return (await res.json()) as SendContext;
}

/**
 * POST /api/v1/docusign/envelopes → triggers backend to send a DocuSign envelope
 * to the chosen contact, using the chosen template.
 * @throws Error with a user-friendly message on failure.
 */
export async function sendEnvelope(input: {
  dealId: string;
  templateId: string;
  /** Omitted when the Deal has no associated contact with email. */
  contactId?: string;
  /** Location text as it should appear in the document (never a HubSpot record id). */
  location: string;
  /** Country text selected in the card's dropdown. */
  country: string;
  /** Agreement text selected in the card's "Acuerdo" dropdown (one of AGREEMENTS). */
  commercialAgreement: string;
  /** Always required: typed by the seller in the card. */
  legalRepresentative: string;
  /** Always required: contacts don't have a DNI field in HubSpot yet, so the seller types it. */
  dniLegalRepresentative: string;
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

export async function voidEnvelope(input: {
  envelopeId: string;
  dealId: string;
  reason: string;
}): Promise<void> {
  const res = await hubspot.fetch(
    `${API_BASE}/api/v1/docusign/envelopes/${encodeURIComponent(input.envelopeId)}/void`,
    { method: 'POST', body: { dealId: input.dealId, reason: input.reason } }
  );
  if (!res.ok) {
    const msg = await extractErrorMessage(res, 'No se pudo cancelar el contrato');
    throw new Error(msg);
  }
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
