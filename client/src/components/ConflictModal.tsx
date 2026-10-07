import React from 'react';
import { AlertCircle, Clock, ArrowRight, X } from 'lucide-react';
import type { AlternativeSlot } from '../types/index.js';

interface ConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: string;
  alternatives?: AlternativeSlot[];
  onSelectAlternative: (alt: AlternativeSlot) => void;
}

export const ConflictModal: React.FC<ConflictModalProps> = ({
  isOpen,
  onClose,
  message,
  alternatives,
  onSelectAlternative,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-6 space-y-4">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Slot Unavailable</h3>
            <p className="text-xs text-slate-300 mt-1">{message}</p>
          </div>
        </div>

        {/* Suggested Alternatives */}
        {alternatives && alternatives.length > 0 && (
          <div className="space-y-2 pt-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
              Suggested Alternative Slots
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {alternatives.map((alt) => (
                <button
                  key={alt.slotStartUtc}
                  type="button"
                  onClick={() => {
                    onSelectAlternative(alt);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-indigo-500 hover:bg-slate-850 text-left transition group"
                >
                  <div className="flex items-center gap-2.5">
                    <Clock className="w-4 h-4 text-indigo-400" />
                    <div>
                      <div className="text-xs font-bold text-white group-hover:text-indigo-200">
                        {alt.formattedLocal}
                      </div>
                      {alt.mentorName && (
                        <div className="text-[11px] text-slate-400">
                          with {alt.mentorName}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-indigo-400 font-semibold group-hover:translate-x-0.5 transition-transform">
                    <span>Select</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
          >
            Choose Another Date / Time
          </button>
        </div>
      </div>
    </div>
  );
};
