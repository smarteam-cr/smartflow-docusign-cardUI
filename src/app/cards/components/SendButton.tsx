import React from 'react';
import { Button } from '@hubspot/ui-extensions';

interface Props {
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
  label?: string;
  overlay?: React.ReactNode;
}

export const SendButton: React.FC<Props> = ({ disabled, loading, onClick, label = 'Enviar documento', overlay }) => (
  <Button onClick={onClick} disabled={disabled || loading} variant="primary" overlay={overlay}>
    {loading ? 'Enviando...' : label}
  </Button>
);
