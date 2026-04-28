import React from 'react';
import { Alert } from '@hubspot/ui-extensions';

type Variant = 'success' | 'danger' | 'info' | 'warning';

interface Props {
  variant: Variant;
  title?: string;
  children: React.ReactNode;
}

/**
 * Wraps Alert with our variant naming. Plain passthrough today; future place
 * to add dismissable-by-default, icons, or i18n integration.
 */
export const StatusMessage: React.FC<Props> = ({ variant, title, children }) => (
  <Alert variant={variant} title={title}>
    {children}
  </Alert>
);
