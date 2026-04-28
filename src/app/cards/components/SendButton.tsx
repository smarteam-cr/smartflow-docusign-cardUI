import React from 'react';
import { Button } from '@hubspot/ui-extensions';

interface Props {
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
  label?: string;
}

/**
 * Primary action button with a loading state. While loading=true, the label
 * becomes "Enviando..." and the button is forced disabled regardless of the
 * disabled prop (so the user can't double-click during a send).
 */
export const SendButton: React.FC<Props> = ({ disabled, loading, onClick, label = 'Enviar documento' }) => (
  <Button onClick={onClick} disabled={disabled || loading} variant="primary">
    {loading ? 'Enviando...' : label}
  </Button>
);
