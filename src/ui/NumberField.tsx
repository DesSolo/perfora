import { useEffect, useId, useState } from 'react';

const fmt = (v: number, digits: number) => String(Number(v.toFixed(digits)));

/** Числовое поле: применяет значение по мере ввода, пока оно корректно. */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  digits = 2,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  digits?: number;
  disabled?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState(fmt(value, digits));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(fmt(value, digits));
  }, [value, digits, focused]);

  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={text}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setText(fmt(value, digits));
        }}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value.replace(',', '.'));
          if (e.target.value.trim() === '' || !Number.isFinite(v)) return;
          if ((min !== undefined && v < min) || (max !== undefined && v > max)) return;
          onChange(v);
        }}
      />
    </label>
  );
}
