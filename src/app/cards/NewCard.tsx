import React, { useEffect, useState } from 'react';
import { hubspot, Flex, LoadingSpinner, Text, Button } from '@hubspot/ui-extensions';
import { fetchTemplates, fetchContacts, sendEnvelope, fetchEnvelopeStatus } from './api/client.js';
import { TemplateSelector } from './components/TemplateSelector.js';
import { ContactSelector } from './components/ContactSelector.js';
import { SendButton } from './components/SendButton.js';
import { StatusMessage } from './components/StatusMessage.js';
import type { UiState, Template, Contact, EnvelopeStatus } from './types.js';

function resolveInitialState(
  templates: Template[],
  contacts: Contact[],
  status: EnvelopeStatus
): UiState {
  if (status.status === 'sent' || status.status === 'signing') {
    return { kind: 'active', envelopeId: status.envelopeId!, status: status.status, sentAt: status.sentAt };
  }
  if (status.status === 'signed') {
    return { kind: 'signed', envelopeId: status.envelopeId!, signedAt: status.signedAt, pdfUrl: status.pdfUrl };
  }
  if (['declined', 'voided', 'expired'].includes(status.status)) {
    return { kind: 'failed', envelopeId: status.envelopeId!, status: status.status };
  }
  return { kind: 'ready', templates, contacts, selectedTemplateId: null, selectedContactId: null };
}

hubspot.extend<'crm.record.tab'>(({ context }) => <Extension context={context} />);

interface ExtensionProps {
  context: {
    crm: {
      objectId: string | number;
    };
  };
}

const Extension: React.FC<ExtensionProps> = ({ context }) => {
  const dealId = String(context.crm.objectId);
  const [state, setState] = useState<UiState>({ kind: 'loading' });

  // Used by user-initiated retries (after loadError) and "Nuevo contrato" from terminal states.
  const loadAll = (): void => {
    setState({ kind: 'loading' });
    Promise.all([fetchTemplates(), fetchContacts(dealId), fetchEnvelopeStatus(dealId)])
      .then(([templates, contacts, envelopeStatus]) => {
        setState(resolveInitialState(templates, contacts, envelopeStatus));
      })
      .catch((err: Error) => setState({ kind: 'loadError', message: err.message }));
  };

  // Initial load on mount, with cancelled flag in case user closes the card mid-fetch.
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchTemplates(), fetchContacts(dealId), fetchEnvelopeStatus(dealId)])
      .then(([templates, contacts, envelopeStatus]) => {
        if (cancelled) return;
        setState(resolveInitialState(templates, contacts, envelopeStatus));
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
      // After a sendError, picking returns to ready (clears the error).
      setState({
        kind: 'ready',
        templates: state.templates,
        contacts: state.contacts,
        selectedTemplateId: id,
        selectedContactId: state.selectedContactId,
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
        templates: state.templates,
        contacts: state.contacts,
        selectedTemplateId: state.selectedTemplateId,
        selectedContactId: id,
      });
    }
  };

  const handleSend = async (): Promise<void> => {
    if (
      state.kind !== 'ready' ||
      !state.selectedTemplateId ||
      !state.selectedContactId
    ) {
      return;
    }
    const { templates, contacts, selectedTemplateId, selectedContactId } = state;
    setState({
      kind: 'sending',
      templates,
      contacts,
      selectedTemplateId,
      selectedContactId,
    });

    try {
      const result = await sendEnvelope({
        dealId,
        templateId: selectedTemplateId,
        contactId: selectedContactId,
      });
      setState({
        kind: 'active',
        envelopeId: result.envelopeId,
        status: 'sent',
        sentAt: new Date().toISOString().split('T')[0]!,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      setState({
        kind: 'sendError',
        templates,
        contacts,
        selectedTemplateId,
        selectedContactId,
        message,
      });
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
          setState({ kind: 'active', envelopeId: status.envelopeId!, status: status.status, sentAt: status.sentAt });
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
          {state.contacts.length === 0 && (
            <StatusMessage variant="warning" title="Este Deal no tiene contactos con email">
              <Text>
                Asocia al menos un contacto al Deal en HubSpot (con un email válido) para
                poder enviar el documento.
              </Text>
            </StatusMessage>
          )}

          <Text>Selecciona el documento y el contacto destinatario:</Text>

          <TemplateSelector
            templates={state.templates}
            value={state.selectedTemplateId}
            disabled={state.kind === 'sending'}
            onChange={handleSelectTemplate}
          />

          <ContactSelector
            contacts={state.contacts}
            value={state.selectedContactId}
            disabled={state.kind === 'sending' || state.contacts.length === 0}
            onChange={handleSelectContact}
          />

          <SendButton
            disabled={
              state.kind === 'sending' ||
              state.contacts.length === 0 ||
              state.templates.length === 0 ||
              (state.kind === 'ready' &&
                (!state.selectedTemplateId || !state.selectedContactId))
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
          <SendButton disabled={false} loading={false} onClick={handleRefresh} label="Refrescar estado" />
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
          <SendButton disabled={false} loading={false} onClick={loadAll} label="Nuevo contrato" />
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
          <SendButton disabled={false} loading={false} onClick={loadAll} label="Nuevo contrato" />
        </Flex>
      )}

    </Flex>
  );
};
