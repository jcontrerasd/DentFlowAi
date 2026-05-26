'use client';

import { CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { InvitationItem, InvitationStatus } from '@/lib/db/actions/invitations';
import UchQuoteBreakdown from '@/components/cases/uch/UchQuoteBreakdown';
import { quoteDisplayFromInvitation } from '@/lib/uchQuoteDisplay';

interface BadgeStyle {
  label: string;
  className: string;
}

function badgeForInvitation(invitation: InvitationItem): BadgeStyle {
  const fb = invitation.dentistRejectionFeedback?.trim();
  switch (invitation.status as InvitationStatus) {
    case 'quoted':
      return { label: 'En evaluación', className: 'text-slate-400 bg-slate-700/60 border-white/10' };
    case 'accepted':
      return { label: 'Seleccionada ✓', className: 'text-teal-400 bg-teal-500/10 border-teal-500/20' };
    case 'confirmed':
      return { label: 'Confirmada ✓', className: 'text-teal-400 bg-teal-500/10 border-teal-500/20' };
    case 'rejected':
      return {
        label: 'No seleccionada',
        className: fb
          ? 'text-rose-300 bg-rose-500/10 border-rose-500/25'
          : 'text-slate-500 bg-slate-800/40 border-white/5',
      };
    case 'expired':
      return { label: 'Expirada', className: 'text-slate-500 bg-slate-800/40 border-white/5' };
    case 'withdrawn':
      return { label: 'Retirada', className: 'text-slate-500 bg-slate-800/40 border-white/5' };
    default:
      return { label: invitation.status, className: 'text-slate-400 bg-slate-700/60 border-white/10' };
  }
}

interface OfferConditionsBlockProps {
  invitation: InvitationItem;
}

export default function OfferConditionsBlock({ invitation }: OfferConditionsBlockProps) {
  const badge = badgeForInvitation(invitation);
  const dentistFb = invitation.dentistRejectionFeedback?.trim();
  const showStatusPill = invitation.status !== 'rejected' || !dentistFb;

  const sentLabel = invitation.respondedAt
    ? format(new Date(invitation.respondedAt), "d 'de' MMMM yyyy · HH:mm", { locale: es })
    : '—';

  const techNotesTrimmed = invitation.techNotes?.trim() ?? '';
  const techNotesDisplay =
    techNotesTrimmed.replace(/^["']+|["']+$/g, '').trim().toLowerCase() !== 'ganador' ? techNotesTrimmed : '';

  return (
    <div className="bg-slate-800/40 border border-white/10 rounded-xl p-3 space-y-2">
      <div className={`flex items-center gap-2 min-w-0 ${showStatusPill ? 'justify-between' : ''}`}>
        <div className="flex items-center gap-2 min-w-0">
          <CheckCircle2 className="w-4 h-4 text-teal-400 flex-shrink-0" />
          <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest truncate">Oferta</span>
        </div>
        {showStatusPill && (
          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border whitespace-normal text-right leading-tight max-w-[55%] ${badge.className}`}>
            {badge.label}
          </span>
        )}
      </div>

      <div className="space-y-1">
        {invitation.quotedPrice != null && (
          <UchQuoteBreakdown quote={quoteDisplayFromInvitation(invitation)} variant="compact" tone="neutral" />
        )}
        <p className="text-[10px] text-slate-500">
          Enviada: <span className="text-slate-400">{sentLabel}</span>
        </p>
        {techNotesDisplay && (
          <p className="text-[10px] text-slate-400 italic">"{techNotesDisplay}"</p>
        )}
        {dentistFb && invitation.status === 'rejected' && (
          <p className="text-[10px] text-rose-300/90 border border-rose-500/20 rounded-lg px-2 py-1 mt-1">
            Comentario del dentista: {dentistFb}
          </p>
        )}
      </div>
    </div>
  );
}
