import React from 'react';
import { Select } from '@hubspot/ui-extensions';
import type { Contact } from '../types.js';

interface Props {
  contacts: Contact[];
  value: string | null;
  disabled: boolean;
  onChange: (id: string) => void;
}

/**
 * Wraps @hubspot/ui-extensions Select with the contacts → options mapping.
 * Each option label is "Nombre Apellido (email)" so the user can disambiguate
 * homonyms by their email before sending.
 *
 * Stateless: receives current selection by prop, emits change events to parent.
 */
export const ContactSelector: React.FC<Props> = ({ contacts, value, disabled, onChange }) => {
  const options = contacts.map((c) => ({
    label: `${c.firstName} ${c.lastName} (${c.email})`.trim(),
    value: c.id,
  }));

  return (
    <Select
      label="Contacto destinatario"
      name="contact"
      options={options}
      value={value ?? undefined}
      placeholder="Seleccione un contacto"
      onChange={(v) => onChange(String(v))}
      readOnly={disabled}
    />
  );
};
