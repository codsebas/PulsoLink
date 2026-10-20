import React from 'react';

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}

const FieldShell: React.FC<FieldProps> = ({ id, label, error, hint, required, children }) => (
  <div>
    <label htmlFor={id} className="block text-xs font-semibold text-slate-700 mb-1">
      {label}
      {required && <span className="text-rose-500 ml-0.5" aria-hidden="true">*</span>}
    </label>
    {children}
    {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    {error && (
      <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-medium text-rose-600">
        {error}
      </p>
    )}
  </div>
);

const inputClasses =
  'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-500';

interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
}

export const TextField: React.FC<TextFieldProps> = ({ id, label, error, hint, required, ...inputProps }) => (
  <FieldShell id={id} label={label} error={error} hint={hint} required={required}>
    <input
      id={id}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      className={inputClasses}
      required={required}
      {...inputProps}
    />
  </FieldShell>
);

interface SelectFieldProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  options: Array<{ value: string; label: string }>;
}

export const SelectField: React.FC<SelectFieldProps> = ({
  id,
  label,
  error,
  hint,
  required,
  options,
  ...selectProps
}) => (
  <FieldShell id={id} label={label} error={error} hint={hint} required={required}>
    <select id={id} className={inputClasses} required={required} {...selectProps}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </FieldShell>
);

interface CheckboxFieldProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
  disabled?: boolean;
}

export const CheckboxField: React.FC<CheckboxFieldProps> = ({
  id,
  label,
  checked,
  onChange,
  hint,
  disabled,
}) => (
  <div>
    <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium text-slate-700">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
      />
      {label}
    </label>
    {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
  </div>
);

/** Convierte errores de un `safeParse` de Zod a un registro campo → mensaje. */
export function zodFieldErrors(result: {
  success: boolean;
  error?: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } };
}): Record<string, string> {
  if (result.success || !result.error) return {};
  const flat = result.error.flatten().fieldErrors;
  const messages: Record<string, string> = {};
  Object.entries(flat).forEach(([field, errors]) => {
    if (errors && errors.length > 0) messages[field] = errors[0];
  });
  return messages;
}
