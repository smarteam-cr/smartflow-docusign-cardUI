import React from 'react';
import { Select } from '@hubspot/ui-extensions';
import type { Template } from '../types.js';

interface Props {
  templates: Template[];
  value: string | null;
  disabled: boolean;
  onChange: (id: string) => void;
}

/**
 * Wraps @hubspot/ui-extensions Select with the templates → options mapping.
 * Stateless: receives current selection by prop, emits change events to parent.
 */
export const TemplateSelector: React.FC<Props> = ({ templates, value, disabled, onChange }) => {
  const options = templates.map((t) => ({ label: t.name, value: t.id }));

  return (
    <Select
      label="Documento a enviar"
      name="template"
      options={options}
      value={value ?? undefined}
      placeholder="Seleccione un documento"
      onChange={(v) => onChange(String(v))}
      readOnly={disabled}
    />
  );
};
