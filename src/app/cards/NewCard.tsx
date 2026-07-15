import React, { useEffect, useState } from 'react';
import { hubspot, Flex, LoadingSpinner, Text, Button, Modal, ModalBody, ModalFooter, Input, Select } from '@hubspot/ui-extensions';
import { fetchSendContext, sendEnvelope, fetchEnvelopeStatus, voidEnvelope } from './api/client.js';
import { TemplateSelector } from './components/TemplateSelector.js';
import { SendButton } from './components/SendButton.js';
import { StatusMessage } from './components/StatusMessage.js';
import { AGREEMENTS } from './types.js';
import type { UiState, SendContext, EnvelopeStatus, Contact } from './types.js';

type ReadyState = Extract<UiState, { kind: 'ready' }>;
type FormPatch = Partial<Omit<ReadyState, 'kind' | 'sendContext'>>;

/**
 * The signer is the single Deal contact with the "Responsable Jurídico"
 * association label. Sending is blocked unless exactly one exists
 * (clienteMode === 'juridico'); 'dropdown' means zero tagged contacts and
 * 'multiple_juridicos_error' means two or more — both are blocking errors.
 */
function fullName(contact: Contact): string {
  return `${contact.firstName} ${contact.lastName}`.trim();
}

/** Sent to the API as `direccionFiscal`: the `direccion_fiscal` property of the Deal's Company, provided by the backend. */
function resolveDireccionFiscal(ctx: SendContext): string {
  return (ctx.direccionFiscal ?? '').trim();
}

/** The Deal's `pais` property, provided by the backend. Sent to the API as `country`. */
function resolveCountry(ctx: SendContext): string {
  return (ctx.pais ?? '').trim();
}

/**
 * Full country name sent to the API as `location` (e.g. "Costa Rica" while
 * `pais` may be "CR"). Falls back to `pais` if the backend didn't send it.
 */
function resolveFullLocation(ctx: SendContext): string {
  return (ctx.fullLocation ?? '').trim() || resolveCountry(ctx);
}

function initialReady(sendContext: SendContext): UiState {
  const juridico = sendContext.clienteMode === 'juridico' ? sendContext.juridicoContact : null;
  return {
    kind: 'ready',
    sendContext,
    selectedTemplateId: null,
    selectedContactId: juridico?.id ?? null,
    selectedAgreement: null,
    dniLegalRepresentative: '',
    exclusiveUse: '',
  };
}

function resolveInitialState(
  sendContext: SendContext,
  status: EnvelopeStatus,
  dealId: string
): UiState {
  if (status.status === 'sent' || status.status === 'signing') {
    return { kind: 'active', envelopeId: status.envelopeId!, dealId, status: status.status, sentAt: status.sentAt };
  }
  if (status.status === 'signed') {
    return { kind: 'signed', envelopeId: status.envelopeId!, signedAt: status.signedAt, pdfUrl: status.pdfUrl };
  }
  if (['declined', 'voided', 'expired'].includes(status.status)) {
    return { kind: 'failed', envelopeId: status.envelopeId!, status: status.status };
  }
  return initialReady(sendContext);
}

hubspot.extend<'crm.record.tab'>(({ context, actions }) => (
  <Extension context={context} actions={actions} />
));

interface ExtensionProps {
  context: {
    crm: {
      objectId: string | number;
    };
    /** The logged-in user; by client rule this is always the Deal owner. */
    user?: {
      /** NOTE: the UI-extension context does NOT expose which team is the default one. */
      teams?: Array<{ id: string | number; name: string }>;
    };
  };
  actions: {
    closeOverlay: (id: string) => void;
  };
}

const Extension: React.FC<ExtensionProps> = ({ context, actions }) => {
  const dealId = String(context.crm.objectId);
  /**
   * Team of the card user; the backend filters templates by it. HubSpot's card
   * context has no "default team" flag, so we take the first team — per client
   * rule users belong to exactly one team (their country).
   */
  const userTeam = context.user?.teams?.[0]?.name?.trim() ?? '';
  const [state, setState] = useState<UiState>({ kind: 'loading' });
  const [confirmTriggered, setConfirmTriggered] = useState(false);
  /** Set when the seller clicks "Enviar" without exactly one "Responsable Jurídico" contact. */
  const [signerError, setSignerError] = useState<string | null>(null);
  const [cancelModal, setCancelModal] = useState<{
    reason: string;
    submitting: boolean;
    error: string | null;
    voidedEnvelopeId: string | null;
  }>({ reason: '', submitting: false, error: null, voidedEnvelopeId: null });

  const resetCancelModal = () => setCancelModal({ reason: '', submitting: false, error: null, voidedEnvelopeId: null });

  const loadAll = (): void => {
    setSignerError(null);
    setState({ kind: 'loading' });
    Promise.all([fetchSendContext(dealId, userTeam), fetchEnvelopeStatus(dealId)])
      .then(([sendContext, envelopeStatus]) => {
        setState(resolveInitialState(sendContext, envelopeStatus, dealId));
      })
      .catch((err: Error) => setState({ kind: 'loadError', message: err.message }));
  };

  const loadForNewContract = (): void => {
    setSignerError(null);
    setState({ kind: 'loading' });
    fetchSendContext(dealId, userTeam)
      .then((sendContext) => setState(initialReady(sendContext)))
      .catch((err: Error) => setState({ kind: 'loadError', message: err.message }));
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchSendContext(dealId, userTeam), fetchEnvelopeStatus(dealId)])
      .then(([sendContext, envelopeStatus]) => {
        if (cancelled) return;
        setState(resolveInitialState(sendContext, envelopeStatus, dealId));
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ kind: 'loadError', message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [dealId, userTeam]);

  /** Applies a form change; if we were in sendError, editing any field returns us to ready. */
  const updateForm = (patch: FormPatch): void => {
    if (state.kind === 'ready') {
      setState({ ...state, ...patch });
      return;
    }
    if (state.kind === 'sendError') {
      setState({
        kind: 'ready',
        sendContext: state.sendContext,
        selectedTemplateId: state.selectedTemplateId,
        selectedContactId: state.selectedContactId,
        selectedAgreement: state.selectedAgreement,
        dniLegalRepresentative: state.dniLegalRepresentative,
        exclusiveUse: state.exclusiveUse,
        ...patch,
      });
    }
  };

  const handleSend = async (): Promise<void> => {
    if (state.kind !== 'ready' || !state.selectedTemplateId) return;

    const { sendContext } = state;
    if (sendContext.clienteMode !== 'juridico' || !sendContext.juridicoContact) return;
    const contactId = sendContext.juridicoContact.id;

    const direccionFiscal = resolveDireccionFiscal(sendContext);
    if (!direccionFiscal) return;

    const country = resolveCountry(sendContext);
    if (!country) return;

    const legalRepresentative = fullName(sendContext.juridicoContact) || sendContext.juridicoContact.email;
    const dniLegalRepresentative = state.dniLegalRepresentative.trim();
    if (!legalRepresentative || !dniLegalRepresentative) return;

    const commercialAgreement = state.selectedAgreement;
    if (!commercialAgreement) return;

    const exclusiveUse = state.exclusiveUse.trim();
    if (!exclusiveUse) return;

    const { selectedTemplateId, selectedAgreement } = state;
    setState({
      kind: 'sending',
      sendContext,
      selectedTemplateId,
      selectedContactId: contactId,
      selectedAgreement,
      dniLegalRepresentative: state.dniLegalRepresentative,
      exclusiveUse: state.exclusiveUse,
    });

    try {
      const result = await sendEnvelope({
        dealId,
        templateId: selectedTemplateId,
        contactId,
        location: resolveFullLocation(sendContext),
        direccionFiscal,
        country,
        commercialAgreement,
        legalRepresentative,
        dniLegalRepresentative,
        exclusiveUse,
      });
      setState({
        kind: 'active',
        envelopeId: result.envelopeId,
        dealId,
        status: 'sent',
        sentAt: new Date().toISOString().split('T')[0]!,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      setState({
        kind: 'sendError',
        sendContext,
        selectedTemplateId,
        selectedContactId: contactId,
        selectedAgreement,
        dniLegalRepresentative: state.dniLegalRepresentative,
        exclusiveUse: state.exclusiveUse,
        message,
      });
    }
  };

  const handleSubmitCancel = async (): Promise<void> => {
    if (state.kind !== 'active') return;
    if (cancelModal.reason.trim().length < 5) {
      setCancelModal({ ...cancelModal, error: 'La razon debe tener al menos 5 caracteres' });
      return;
    }
    setCancelModal({ ...cancelModal, submitting: true, error: null });
    try {
      await voidEnvelope({
        envelopeId: state.envelopeId,
        dealId: state.dealId,
        reason: cancelModal.reason.trim(),
      });
      setCancelModal({ reason: '', submitting: false, error: null, voidedEnvelopeId: state.envelopeId });
      actions.closeOverlay('cancel-contract-modal');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      setCancelModal({ ...cancelModal, submitting: false, error: message });
    }
  };

  const handleRefresh = (): void => {
    setState({ kind: 'loading' });
    fetchEnvelopeStatus(dealId)
      .then((status) => {
        if (status.status === 'signed') {
          setState({ kind: 'signed', envelopeId: status.envelopeId!, signedAt: status.signedAt, pdfUrl: status.pdfUrl });
        } else if (['declined', 'voided', 'expired'].includes(status.status)) {
          setState({ kind: 'failed', envelopeId: status.envelopeId!, status: status.status });
        } else {
          setState({ kind: 'active', envelopeId: status.envelopeId!, dealId, status: status.status, sentAt: status.sentAt });
        }
      })
      .catch((err: Error) => setState({ kind: 'loadError', message: err.message }));
  };

  return (
    <Flex direction="column" gap="medium">

      {state.kind === 'loading' && (
        <Flex direction="column" align="center" gap="small">
          <LoadingSpinner label="Cargando documentos y contactos..." showLabel layout="centered" />
        </Flex>
      )}

      {state.kind === 'loadError' && (
        <Flex direction="column" gap="small">
          <StatusMessage variant="danger" title="No pudimos cargar la información">
            <Text>{state.message}</Text>
          </StatusMessage>
          <SendButton
            disabled={false}
            loading={false}
            onClick={loadAll}
            label="Reintentar"
          />
        </Flex>
      )}

      {(state.kind === 'ready' || state.kind === 'sending' || state.kind === 'sendError') && (
        <Flex direction="column" gap="small">
          {state.sendContext.clienteMode === 'juridico' && state.sendContext.juridicoContact && (
            <StatusMessage variant="info" title="Firmante (responsable jurídico)">
              <Text>{state.sendContext.juridicoContact.firstName} {state.sendContext.juridicoContact.lastName} ({state.sendContext.juridicoContact.email})</Text>
            </StatusMessage>
          )}

          <Text>Selecciona el documento:</Text>

          <TemplateSelector
            templates={state.sendContext.templates}
            value={state.selectedTemplateId}
            disabled={state.kind === 'sending'}
            onChange={(id) => updateForm({ selectedTemplateId: id })}
          />

          <Input
            label="Número de identificación"
            name="dni-legal-representative"
            value={state.dniLegalRepresentative}
            placeholder="Número de identificación del firmante"
            onChange={(v) => updateForm({ dniLegalRepresentative: String(v) })}
            readOnly={state.kind === 'sending'}
          />

          <Input
            label="Uso exclusivo"
            name="exclusive-use"
            value={state.exclusiveUse}
            placeholder="Para uso exclusivo <marca>, <producto>, <nombre>"
            onChange={(v) => updateForm({ exclusiveUse: String(v) })}
            readOnly={state.kind === 'sending'}
          />

          <Select
            label="Acuerdo"
            name="agreement"
            options={AGREEMENTS.map((a) => ({ label: a, value: a }))}
            value={state.selectedAgreement ?? undefined}
            placeholder="Seleccione un acuerdo"
            onChange={(v: string | number | boolean) => updateForm({ selectedAgreement: String(v) })}
            readOnly={state.kind === 'sending'}
          />

          {state.sendContext.company && (
            <Text>Empresa: {state.sendContext.company.razonSocial}</Text>
          )}
          {state.sendContext.hasQuote && <Text>✓ Cotización vinculada</Text>}
          {state.sendContext.capexCount > 0 && (
            <Text>✓ {state.sendContext.capexCount} capex incluidos</Text>
          )}
          <Text format={{ italic: true }}>Firmará en orden: Propietario → Proveedor → Cliente</Text>

          <SendButton
            disabled={
              state.kind === 'sending' ||
              state.sendContext.templates.length === 0 ||
              !state.selectedTemplateId ||
              !state.selectedAgreement ||
              state.dniLegalRepresentative.trim() === '' ||
              state.exclusiveUse.trim() === ''
            }
            loading={state.kind === 'sending'}
            onClick={() => {
              if (state.sendContext.clienteMode === 'multiple_juridicos_error') {
                setSignerError('El Deal tiene más de un contacto con la etiqueta "Responsable Jurídico". Deja la etiqueta en un solo contacto en HubSpot y vuelve a comprobar.');
              } else if (state.sendContext.clienteMode !== 'juridico' || !state.sendContext.juridicoContact) {
                setSignerError('Ningún contacto asociado al Deal tiene la etiqueta "Responsable Jurídico". Asígnala a exactamente un contacto en HubSpot (Contactos → ⋯ → Editar etiquetas de asociación) y vuelve a comprobar.');
              } else if (resolveDireccionFiscal(state.sendContext) === '') {
                setSignerError('La Empresa asociada al negocio no tiene la propiedad "Dirección fiscal" (direccion_fiscal). Llénala en HubSpot y vuelve a comprobar.');
              } else if (resolveCountry(state.sendContext) === '') {
                setSignerError('El negocio no tiene la propiedad "País" (pais). Llénala en HubSpot y vuelve a comprobar.');
              } else {
                setSignerError(null);
              }
            }}
            overlay={
              state.sendContext.clienteMode !== 'juridico' ||
              !state.sendContext.juridicoContact ||
              resolveDireccionFiscal(state.sendContext) === '' ||
              resolveCountry(state.sendContext) === ''
                ? undefined
                : (() => {
              const ctx = state.sendContext;
              const tpl = ctx.templates.find(t => t.id === state.selectedTemplateId);
              const cliente = ctx.clienteMode === 'juridico' ? ctx.juridicoContact : null;
              const direccionFiscal = resolveDireccionFiscal(ctx);

              return (
                <Modal
                  id="confirm-send-modal"
                  title="Confirmar envío"
                  onClose={() => {
                    if (confirmTriggered) {
                      setConfirmTriggered(false);
                      handleSend();
                    }
                  }}
                >
                  <ModalBody>
                    <Flex direction="column" gap="small">
                      {tpl && <Text format={{ fontWeight: 'bold' }}>Documento: {tpl.name}</Text>}
                      {ctx.company && <Text>Empresa: {ctx.company.razonSocial} ({ctx.company.pais})</Text>}
                      {direccionFiscal && <Text>Dirección fiscal: {direccionFiscal}</Text>}
                      {resolveFullLocation(ctx) && <Text>País: {resolveFullLocation(ctx)}</Text>}
                      {state.selectedAgreement && <Text>Acuerdo: {state.selectedAgreement}</Text>}
                      {cliente && <Text>Cliente: {cliente.firstName} {cliente.lastName} ({cliente.email})</Text>}
                      {cliente && (
                        <Text>Representante legal: {fullName(cliente) || cliente.email}</Text>
                      )}
                      {state.dniLegalRepresentative.trim() !== '' && (
                        <Text>Número de identificación: {state.dniLegalRepresentative}</Text>
                      )}
                      {state.exclusiveUse.trim() !== '' && (
                        <Text>Uso exclusivo: {state.exclusiveUse}</Text>
                      )}
                      {ctx.hasQuote && <Text>✓ Cotización vinculada</Text>}
                      {ctx.capexCount > 0 && <Text>✓ {ctx.capexCount} capex incluidos</Text>}
                      <Text format={{ italic: true }}>El documento será firmado en orden: Propietario → Proveedor → Cliente</Text>
                    </Flex>
                  </ModalBody>
                  <ModalFooter>
                    <Button
                      variant="primary"
                      onClick={() => {
                        setConfirmTriggered(true);
                        actions.closeOverlay('confirm-send-modal');
                      }}
                    >
                      Confirmar envío
                    </Button>
                  </ModalFooter>
                </Modal>
              );
            })()}
          />

          {signerError && (
            <>
              <StatusMessage variant="danger" title="No se puede enviar">
                <Text>{signerError}</Text>
              </StatusMessage>
              <Button variant="secondary" onClick={loadAll}>Volver a comprobar</Button>
            </>
          )}

          {state.kind === 'sendError' && (
            <StatusMessage variant="danger" title="No se pudo enviar">
              <Text>{state.message}</Text>
            </StatusMessage>
          )}
        </Flex>
      )}

      {state.kind === 'active' && (
        <Flex direction="column" gap="small">
          <StatusMessage variant="info" title="Contrato en proceso">
            <Text>Estado: {state.status === 'sent' ? 'Enviado' : 'En firma'}</Text>
            {state.sentAt && <Text>Enviado: {state.sentAt}</Text>}
          </StatusMessage>
          <Flex direction="row" gap="small">
            <SendButton disabled={false} loading={false} onClick={handleRefresh} label="Refrescar estado" />
            <Button
              variant="destructive"
              onClick={resetCancelModal}
              overlay={
                <Modal
                  id="cancel-contract-modal"
                  title="Cancelar contrato"
                  variant="danger"
                  onClose={() => {
                    const eid = cancelModal.voidedEnvelopeId;
                    resetCancelModal();
                    if (eid) {
                      setState({ kind: 'failed', envelopeId: eid, status: 'voided' });
                    }
                  }}
                >
                  <ModalBody>
                    <Flex direction="column" gap="small">
                      <Text>Esta accion no se puede deshacer. El contrato sera cancelado en DocuSign.</Text>
                      <Input
                        label="Razon de cancelacion"
                        name="cancel-reason"
                        value={cancelModal.reason}
                        onChange={(v) => setCancelModal({ ...cancelModal, reason: String(v), error: null })}
                        readOnly={cancelModal.submitting}
                        placeholder="Minimo 5 caracteres"
                      />
                      {cancelModal.error && (
                        <StatusMessage variant="danger" title="Error">
                          <Text>{cancelModal.error}</Text>
                        </StatusMessage>
                      )}
                    </Flex>
                  </ModalBody>
                  <ModalFooter>
                    <Button
                      variant="destructive"
                      onClick={handleSubmitCancel}
                      disabled={cancelModal.submitting || cancelModal.reason.trim().length < 5}
                    >
                      {cancelModal.submitting ? 'Cancelando...' : 'Si, cancelar'}
                    </Button>
                  </ModalFooter>
                </Modal>
              }
            >
              Cancelar contrato
            </Button>
          </Flex>
        </Flex>
      )}

      {state.kind === 'signed' && (
        <Flex direction="column" gap="small">
          <StatusMessage variant="success" title="Contrato firmado">
            {state.signedAt && <Text>Firmado: {state.signedAt}</Text>}
          </StatusMessage>
          {state.pdfUrl && (
            <Button href={{ url: state.pdfUrl, external: true }} variant="secondary">Ver contrato firmado</Button>
          )}
          <SendButton disabled={false} loading={false} onClick={loadForNewContract} label="Nuevo contrato" />
        </Flex>
      )}

      {state.kind === 'failed' && (
        <Flex direction="column" gap="small">
          <StatusMessage variant="danger" title={
            state.status === 'declined' ? 'Contrato rechazado' :
            state.status === 'voided' ? 'Contrato cancelado' :
            'Contrato expirado'
          }>
            <Text>El contrato anterior fue {state.status === 'declined' ? 'rechazado por un firmante' : state.status === 'voided' ? 'cancelado' : 'expirado sin firmar'}.</Text>
          </StatusMessage>
          <SendButton disabled={false} loading={false} onClick={loadForNewContract} label="Nuevo contrato" />
        </Flex>
      )}

    </Flex>
  );
};
