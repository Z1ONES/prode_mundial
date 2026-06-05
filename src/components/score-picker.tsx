"use client";

import { useState } from "react";
import type { ReactNode } from "react";

type ScorePickerProps = {
  children: ReactNode;
  id: string;
  name: string;
  defaultValue?: number | null;
  allowEmpty?: boolean;
  required?: boolean;
};

const QUICK_VALUES = [0, 1, 2, 3, 4, 5];

export function ScorePicker({
  allowEmpty,
  children,
  id,
  name,
  defaultValue,
  required
}: ScorePickerProps) {
  const [value, setValue] = useState<number | "">(defaultValue ?? (allowEmpty ? "" : 0));

  return (
    <div className="score-picker">
      <label htmlFor={id}>{children}</label>
      <input id={id} name={name} type="hidden" value={value} required={required} />
      <div className="score-readout" aria-live="polite">
        {value === "" ? "-" : value}
      </div>
      <div className="score-buttons" aria-label={`Goles para ${name}`}>
        {allowEmpty ? (
          <button
            aria-pressed={value === ""}
            className="score-choice"
            onClick={() => setValue("")}
            type="button"
          >
            -
          </button>
        ) : null}
        {QUICK_VALUES.map((score) => (
          <button
            aria-pressed={value === score}
            className="score-choice"
            key={score}
            onClick={() => setValue(score)}
            type="button"
          >
            {score === 5 ? "5+" : score}
          </button>
        ))}
      </div>
      <div className="score-stepper">
        <button
          type="button"
          onClick={() =>
            setValue((current) => (current === "" ? 0 : Math.max(0, current - 1)))
          }
        >
          -
        </button>
        <button
          type="button"
          onClick={() =>
            setValue((current) => (current === "" ? 0 : Math.min(99, current + 1)))
          }
        >
          +
        </button>
      </div>
    </div>
  );
}
