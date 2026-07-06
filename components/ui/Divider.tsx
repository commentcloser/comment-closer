import React from 'react';

interface DividerProps {
  text?: string;
}

export const Divider: React.FC<DividerProps> = ({ text }) => {
  if (!text) {
    return <div className="border-t border-line my-6" />;
  }

  return (
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-line"></div>
      </div>
      <div className="relative flex justify-center">
        <span className="bg-surface px-3 text-[13px] text-ink-muted">{text}</span>
      </div>
    </div>
  );
};
