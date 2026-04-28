import React, { useEffect, useState } from 'react';
import { hubspot, Flex, LoadingSpinner, Text } from '@hubspot/ui-extensions';
import { fetchTemplates, sendEnvelope } from './api/client.js';
import { TemplateSelector } from './components/TemplateSelector.js';
import { SendButton } from './components/SendButton.js';
import { StatusMessage } from './components/StatusMessage.js';
import type { UiState } from './types.js';

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

  // Used by user-initiated retries (after loadError or after a success "send another")
  const loadTemplates = (): void => {
    setState({ kind: 'loading' });
    fetchTemplates()
      .then((templates) => setState({ kind: 'ready', templates, selected: null }))
      .catch((err: Error) => setState({ kind: 'loadError', message: err.message }));
  };

  // Initial load on mount, with cancelled flag in case user closes the card mid-fetch
  useEffect(() => {
    let cancelled = false;
    fetchTemplates()
      .then((templates) => {
        if (!cancelled) setState({ kind: 'ready', templates, selected: null });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ kind: 'loadError', message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelect = (id: string): void => {
    if (state.kind === 'ready') {
      setState({ kind: 'ready', templates: state.templates, selected: id });
      return;
    }
    if (state.kind === 'sendError') {
      // After a sendError, picking a template returns to ready (clears the error)
      setState({ kind: 'ready', templates: state.templates, selected: id });
    }
  };

  const handleSend = async (): Promise<void> => {
    if (state.kind !== 'ready' || !state.selected) return;
    const { selected, templates } = state;
    setState({ kind: 'sending', templates, selected });

    try {
      const result = await sendEnvelope({ dealId, templateId: selected });
      setState({ kind: 'success', recipientEmail: result.recipientEmail });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      setState({ kind: 'sendError', templates, selected, message });
    }
  };

  return (
    <Flex direction="column" gap="medium">
      <Text format={{ fontWeight: 'bold' }}>Firmas DocuSign</Text>

      {state.kind === 'loading' && (
        <Flex direction="column" align="center" gap="small">
          <LoadingSpinner label="Cargando documentos..." showLabel layout="centered" />
        </Flex>
      )}

      {state.kind === 'loadError' && (
        <Flex direction="column" gap="small">
          <StatusMessage variant="danger" title="No pudimos cargar los documentos">
            <Text>{state.message}</Text>
          </StatusMessage>
          <SendButton
            disabled={false}
            loading={false}
            onClick={loadTemplates}
            label="Reintentar"
          />
        </Flex>
      )}

      {(state.kind === 'ready' || state.kind === 'sending' || state.kind === 'sendError') && (
        <Flex direction="column" gap="small">
          <Text>Selecciona el documento para enviar al contacto del Deal:</Text>
          <TemplateSelector
            templates={state.templates}
            value={state.selected}
            disabled={state.kind === 'sending'}
            onChange={handleSelect}
          />
          <SendButton
            disabled={state.kind === 'ready' && !state.selected}
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

      {state.kind === 'success' && (
        <Flex direction="column" gap="small">
          <StatusMessage variant="success" title="Documento enviado">
            <Text>Se envió a: {state.recipientEmail}</Text>
          </StatusMessage>
          <SendButton
            disabled={false}
            loading={false}
            onClick={loadTemplates}
            label="Enviar otro documento"
          />
        </Flex>
      )}
    </Flex>
  );
};
