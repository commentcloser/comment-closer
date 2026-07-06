import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-[13px] font-medium text-ink mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`w-full h-11 rounded-btn border bg-surface px-3.5 text-[15px] text-ink placeholder:text-ink-muted/60 transition-colors focus:outline-none focus:ring-2 disabled:bg-surface-2 disabled:text-ink-muted disabled:cursor-not-allowed ${
            error
              ? 'border-danger focus:border-danger focus:ring-danger/30'
              : 'border-line focus:border-accent focus:ring-ring'
          } ${className}`}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-[13px] text-danger">{error}</p>
        )}
        {helperText && !error && (
          <p className="mt-1.5 text-[13px] text-ink-muted">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
