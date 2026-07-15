import { hubspot } from '@hubspot/ui-extensions';
import type { SendContext, SendEnvelopeResult, EnvelopeStatus } from '../types.js';

/**
 * Dummy HTTPS URL that the HubSpot CLI proxies to http://localhost:3002 in dev
 * (via local.json in src/app/). In production this constant is replaced with
 * the real backend domain.
 *
 * MUST stay listed in app-hsmeta.json's permittedUrls.fetch.
 */
const API_BASE = 'https://api.docusign-integration.local';
//const API_BASE = 'https://smartds.smarteamcr.com';

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
 * @param userTeam Name of the card user's primary team ("Equipo predeterminado"),
 * e.g. "Costa Rica". The backend uses it to filter the templates it returns.
 * Sent as the `userTeam` query param; omitted when the user has no primary team.
 */
export async function fetchSendContext(dealId: string, userTeam: string): Promise<SendContext> {
  const query = userTeam ? `?userTeam=${encodeURIComponent(userTeam)}` : '';
  const res = await hubspot.fetch(
    `${API_BASE}/api/v1/deals/${encodeURIComponent(dealId)}/send-context${query}`,
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
  /** The Deal contact with the "Responsable Jurídico" association label (the signer). */
  contactId: string;
  /** The `direccion_fiscal` property of the Company associated to the Deal (text, from send-context). */
  location: string;
  /** The Deal's `pais` property (text, from send-context). */
  country: string;
  /** Agreement text selected in the card's "Acuerdo" dropdown (one of AGREEMENTS). */
  commercialAgreement: string;
  /** Full name of the "Responsable Jurídico" contact; derived by the card, no longer typed by the seller. */
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
