import { hubspot } from '@hubspot/ui-extensions';
import type { Template, SendEnvelopeResult } from '../types.js';

/**
 * Dummy HTTPS URL that the HubSpot CLI proxies to http://localhost:3000 in dev
 * (via local.json). In production this constant gets replaced with the real
 * backend domain — see deployment notes in card CLAUDE.md.
 *
 * MUST stay listed in app-hsmeta.json's permittedUrls.fetch — HubSpot rejects
 * fetches to URLs not whitelisted there.
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
 * POST /api/v1/docusign/envelopes → triggers backend to send a DocuSign envelope
 * to the first contact associated to the given Deal, using the given template.
 * @throws Error with a user-friendly message on failure.
 */
export async function sendEnvelope(input: {
  dealId: string;
  templateId: string;
}): Promise<SendEnvelopeResult> {
  const res = await hubspot.fetch(`${API_BASE}/api/v1/docusign/envelopes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const msg = await extractErrorMessage(res, 'No pudimos enviar el documento');
    throw new Error(msg);
  }

  return (await res.json()) as SendEnvelopeResult;
}
