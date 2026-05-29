import React, { useEffect, useState } from 'react';
import { hubspot, Flex, LoadingSpinner, Text, Button, Modal, ModalBody, ModalFooter, Input, Select } from '@hubspot/ui-extensions';
import { fetchSendContext, sendEnvelope, fetchEnvelopeStatus, voidEnvelope } from './api/client.js';
import { TemplateSelector } from './components/TemplateSelector.js';
import { ContactSelector } from './components/ContactSelector.js';
import { SendButton } from './components/SendButton.js';
import { StatusMessage } from './components/StatusMessage.js';
import type { UiState, SendContext, EnvelopeStatus } from './types.js';

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
  return { kind: 'ready', sendContext, selectedTemplateId: null, selectedContactId: null, selectedDirectionId: null };
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
  const [cancelModal, setCancelModal] = useState<{
    reason: string;
    submitting: boolean;
    error: string | null;
    voidedEnvelopeId: string | null;
  }>({ reason: '', submitting: false, error: null, voidedEnvelopeId: null });

  const resetCancelModal = () => setCancelModal({ reason: '', submitting: false, error: null, voidedEnvelopeId: null });

  const loadAll = (): void => {
    setState({ kind: 'loading' });
    Promise.all([fetchSendContext(dealId), fetchEnvelopeStatus(dealId)])
      .then(([sendContext, envelopeStatus]) => {
        setState(resolveInitialState(sendContext, envelopeStatus, dealId));
      })
      .catch((err: Error) => setState({ kind: 'loadError', message: err.message }));
  };

  const loadForNewContract = (): void => {
    setState({ kind: 'loading' });
    fetchSendContext(dealId)
      .then((sendContext) => {
        setState({ kind: 'ready', sendContext, selectedTemplateId: null, selectedContactId: null, selectedDirectionId: null });
      })
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

  const handleSelectTemplate = (id: string): void => {
    if (state.kind === 'ready') {
      setState({ ...state, selectedTemplateId: id });
      return;
    }
    if (state.kind === 'sendError') {
      setState({
        kind: 'ready',
        sendContext: state.sendContext,
        selectedTemplateId: id,
        selectedContactId: state.selectedContactId,
        selectedDirectionId: state.selectedDirectionId,
      });
    }
  };

  const handleSelectContact = (id: string): void => {
    if (state.kind === 'ready') {
      setState({ ...state, selectedContactId: id });
      return;
    }
    if (state.kind === 'sendError') {
      setState({
        kind: 'ready',
        sendContext: state.sendContext,
        selectedTemplateId: state.selectedTemplateId,
        selectedContactId: id,
        selectedDirectionId: state.selectedDirectionId,
      });
    }
  };

  const handleSelectDirection = (id: string): void => {
    if (state.kind === 'ready') {
      setState({ ...state, selectedDirectionId: id });
      return;
    }
    if (state.kind === 'sendError') {
      setState({
        kind: 'ready',
        sendContext: state.sendContext,
        selectedTemplateId: state.selectedTemplateId,
        selectedContactId: state.selectedContactId,
        selectedDirectionId: id,
      });
    }
  };

  const handleSend = async (): Promise<void> => {
    if (state.kind !== 'ready' || !state.selectedTemplateId) return;

    const { sendContext } = state;
    const contactId = sendContext.clienteMode === 'juridico'
      ? sendContext.juridicoContact!.id
      : state.selectedContactId;
    if (!contactId) return;

    const directionId = sendContext.direcciones.length === 1
      ? sendContext.direcciones[0].id
      : state.selectedDirectionId ?? undefined;

    const { selectedTemplateId, selectedDirectionId } = state;
    setState({
      kind: 'sending',
      sendContext,
      selectedTemplateId,
      selectedContactId: contactId,
      selectedDirectionId,
    });

    try {
      const result = await sendEnvelope({
        dealId,
        templateId: selectedTemplateId,
        contactId,
        directionId,
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
          {state.sendContext.clienteMode === 'multiple_juridicos_error' && (
            <StatusMessage variant="danger" title="Error: múltiples responsables jurídicos">
              <Text>El Deal tiene más de un contacto marcado como responsable jurídico. Corrige en HubSpot.</Text>
            </StatusMessage>
          )}

          {state.sendContext.clienteMode === 'juridico' && state.sendContext.juridicoContact && (
            <StatusMessage variant="info" title="Cliente (responsable jurídico)">
              <Text>{state.sendContext.juridicoContact.firstName} {state.sendContext.juridicoContact.lastName} ({state.sendContext.juridicoContact.email})</Text>
            </StatusMessage>
          )}

          {state.sendContext.clienteMode === 'dropdown' && state.sendContext.contacts.length === 0 && (
            <StatusMessage variant="warning" title="Este Deal no tiene contactos con email">
              <Text>
                Asocia al menos un contacto al Deal en HubSpot (con un email válido) para
                poder enviar el documento.
              </Text>
            </StatusMessage>
          )}

          <Text>Selecciona el documento{state.sendContext.clienteMode === 'dropdown' ? ' y el contacto destinatario' : ''}:</Text>

          <TemplateSelector
            templates={state.sendContext.templates}
            value={state.selectedTemplateId}
            disabled={state.kind === 'sending'}
            onChange={handleSelectTemplate}
          />

          {state.sendContext.clienteMode === 'dropdown' && (
            <ContactSelector
              contacts={state.sendContext.contacts}
              value={state.selectedContactId}
              disabled={state.kind === 'sending' || state.sendContext.contacts.length === 0}
              onChange={handleSelectContact}
            />
          )}

          {state.sendContext.direcciones.length === 1 && (
            <Text>Dirección: {state.sendContext.direcciones[0].direction} (auto)</Text>
          )}

          {state.sendContext.direcciones.length > 1 && (
            <Select
              label="Dirección"
              name="direction"
              options={state.sendContext.direcciones.map(d => ({ label: d.direction, value: d.id }))}
              value={state.selectedDirectionId ?? undefined}
              placeholder="Seleccione una dirección"
              onChange={(v: string | number | boolean) => handleSelectDirection(String(v))}
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
              state.sendContext.clienteMode === 'multiple_juridicos_error' ||
              state.sendContext.templates.length === 0 ||
              !state.selectedTemplateId ||
              (state.sendContext.clienteMode === 'dropdown' && !state.selectedContactId) ||
              (state.sendContext.direcciones.length > 1 && !state.selectedDirectionId)
            }
            loading={state.kind === 'sending'}
            onClick={handleSend}
          />

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
