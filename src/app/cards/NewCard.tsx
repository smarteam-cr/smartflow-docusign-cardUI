import React, { useEffect, useState } from 'react';
import { hubspot, Flex, LoadingSpinner, Text, Button, Modal, ModalBody, ModalFooter, Input, Select } from '@hubspot/ui-extensions';
import { fetchSendContext, sendEnvelope, fetchEnvelopeStatus, voidEnvelope } from './api/client.js';
import { TemplateSelector } from './components/TemplateSelector.js';
import { SendButton } from './components/SendButton.js';
import { StatusMessage } from './components/StatusMessage.js';
import { CUSTOM_LOCATION, COUNTRIES, AGREEMENTS } from './types.js';
import type { UiState, SendContext, EnvelopeStatus, Contact } from './types.js';

type ReadyState = Extract<UiState, { kind: 'ready' }>;
type FormState = Extract<UiState, { kind: 'ready' | 'sending' | 'sendError' }>;
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

/** Location text to send to the API: the chosen dirección's text, or the manually typed one. */
function resolveLocation(state: FormState): string {
  const { direcciones } = state.sendContext;
  if (direcciones.length === 0 || state.selectedDirectionId === CUSTOM_LOCATION) {
    return state.customLocation.trim();
  }
  return direcciones.find((d) => d.id === state.selectedDirectionId)?.direction ?? '';
}

function initialReady(sendContext: SendContext): UiState {
  const juridico = sendContext.clienteMode === 'juridico' ? sendContext.juridicoContact : null;
  return {
    kind: 'ready',
    sendContext,
    selectedTemplateId: null,
    selectedContactId: juridico?.id ?? null,
    selectedDirectionId: sendContext.direcciones.length === 1 ? sendContext.direcciones[0].id : null,
    selectedCountry: null,
    selectedAgreement: null,
    customLocation: '',
    dniLegalRepresentative: '',
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
  };
  actions: {
    closeOverlay: (id: string) => void;
  };
}

const Extension: React.FC<ExtensionProps> = ({ context, actions }) => {
  const dealId = String(context.crm.objectId);
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
    Promise.all([fetchSendContext(dealId), fetchEnvelopeStatus(dealId)])
      .then(([sendContext, envelopeStatus]) => {
        setState(resolveInitialState(sendContext, envelopeStatus, dealId));
      })
      .catch((err: Error) => setState({ kind: 'loadError', message: err.message }));
  };

  const loadForNewContract = (): void => {
    setSignerError(null);
    setState({ kind: 'loading' });
    fetchSendContext(dealId)
      .then((sendContext) => setState(initialReady(sendContext)))
      .catch((err: Error) => setState({ kind: 'loadError', message: err.message }));
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchSendContext(dealId), fetchEnvelopeStatus(dealId)])
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
  }, [dealId]);

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
        selectedDirectionId: state.selectedDirectionId,
        selectedCountry: state.selectedCountry,
        selectedAgreement: state.selectedAgreement,
        customLocation: state.customLocation,
        dniLegalRepresentative: state.dniLegalRepresentative,
        ...patch,
      });
    }
  };

  const handleSend = async (): Promise<void> => {
    if (state.kind !== 'ready' || !state.selectedTemplateId) return;

    const { sendContext } = state;
    if (sendContext.clienteMode !== 'juridico' || !sendContext.juridicoContact) return;
    const contactId = sendContext.juridicoContact.id;

    const location = resolveLocation(state);
    if (!location) return;

    const legalRepresentative = fullName(sendContext.juridicoContact) || sendContext.juridicoContact.email;
    const dniLegalRepresentative = state.dniLegalRepresentative.trim();
    if (!legalRepresentative || !dniLegalRepresentative) return;

    const country = state.selectedCountry;
    if (!country) return;

    const commercialAgreement = state.selectedAgreement;
    if (!commercialAgreement) return;

    const { selectedTemplateId, selectedDirectionId, selectedCountry, selectedAgreement, customLocation } = state;
    setState({
      kind: 'sending',
      sendContext,
      selectedTemplateId,
      selectedContactId: contactId,
      selectedDirectionId,
      selectedCountry,
      selectedAgreement,
      customLocation,
      dniLegalRepresentative: state.dniLegalRepresentative,
    });

    try {
      const result = await sendEnvelope({
        dealId,
        templateId: selectedTemplateId,
        contactId,
        location,
        country,
        commercialAgreement,
        legalRepresentative,
        dniLegalRepresentative,
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
        selectedDirectionId,
        selectedCountry,
        selectedAgreement,
        customLocation,
        dniLegalRepresentative: state.dniLegalRepresentative,
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
            label="DNI del firmante"
            name="dni-legal-representative"
            value={state.dniLegalRepresentative}
            placeholder="Documento de identidad"
            onChange={(v) => updateForm({ dniLegalRepresentative: String(v) })}
            readOnly={state.kind === 'sending'}
          />

          <Select
            label="País"
            name="country"
            options={COUNTRIES.map((c) => ({ label: c, value: c }))}
            value={state.selectedCountry ?? undefined}
            placeholder="Seleccione un país"
            onChange={(v: string | number | boolean) => updateForm({ selectedCountry: String(v) })}
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

          {state.sendContext.direcciones.length > 0 && (
            <Select
              label="Dirección"
              name="location"
              options={[
                ...state.sendContext.direcciones.map((d) => ({ label: d.direction, value: d.id })),
                { label: 'Otra (escribir manualmente)', value: CUSTOM_LOCATION },
              ]}
              value={state.selectedDirectionId ?? undefined}
              placeholder="Seleccione una dirección"
              onChange={(v: string | number | boolean) => updateForm({ selectedDirectionId: String(v) })}
              readOnly={state.kind === 'sending'}
            />
          )}

          {(state.sendContext.direcciones.length === 0 || state.selectedDirectionId === CUSTOM_LOCATION) && (
            <Input
              label={state.sendContext.direcciones.length === 0 ? 'Dirección' : 'Dirección (manual)'}
              name="custom-location"
              value={state.customLocation}
              placeholder="Escriba la dirección"
              onChange={(v) => updateForm({ customLocation: String(v) })}
              readOnly={state.kind === 'sending'}
            />
          )}

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
              resolveLocation(state) === '' ||
              !state.selectedCountry ||
              !state.selectedAgreement ||
              state.dniLegalRepresentative.trim() === ''
            }
            loading={state.kind === 'sending'}
            onClick={() => {
              if (state.sendContext.clienteMode === 'multiple_juridicos_error') {
                setSignerError('El Deal tiene más de un contacto con la etiqueta "Responsable Jurídico". Deja la etiqueta en un solo contacto en HubSpot y vuelve a comprobar.');
              } else if (state.sendContext.clienteMode !== 'juridico' || !state.sendContext.juridicoContact) {
                setSignerError('Ningún contacto asociado al Deal tiene la etiqueta "Responsable Jurídico". Asígnala a exactamente un contacto en HubSpot (Contactos → ⋯ → Editar etiquetas de asociación) y vuelve a comprobar.');
              } else {
                setSignerError(null);
              }
            }}
            overlay={state.sendContext.clienteMode !== 'juridico' || !state.sendContext.juridicoContact ? undefined : (() => {
              const ctx = state.sendContext;
              const tpl = ctx.templates.find(t => t.id === state.selectedTemplateId);
              const cliente = ctx.clienteMode === 'juridico' ? ctx.juridicoContact : null;
              const location = resolveLocation(state);

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
                      {location && <Text>Dirección: {location}</Text>}
                      {state.selectedCountry && <Text>País: {state.selectedCountry}</Text>}
                      {state.selectedAgreement && <Text>Acuerdo: {state.selectedAgreement}</Text>}
                      {cliente && <Text>Cliente: {cliente.firstName} {cliente.lastName} ({cliente.email})</Text>}
                      {cliente && (
                        <Text>Representante legal: {fullName(cliente) || cliente.email}</Text>
                      )}
                      {state.dniLegalRepresentative.trim() !== '' && (
                        <Text>DNI del firmante: {state.dniLegalRepresentative}</Text>
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
