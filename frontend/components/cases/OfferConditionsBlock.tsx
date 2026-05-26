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
      return { label: 'En evaluación', className: 'text-muted bg-surface-off border-divider' };
    case 'accepted':
      return { label: 'Seleccionada ✓', className: 'text-primary bg-primary-hl border-primary/20' };
    case 'confirmed':
      return { label: 'Confirmada ✓', className: 'text-primary bg-primary-hl border-primary/20' };
    case 'rejected':
      return {
        label: 'No seleccionada',
        className: fb
          ? 'text-error bg-error-hl border-error/20'
          : 'text-faint bg-surface-2/40 border-divider',
      };
    case 'expired':
      return { label: 'Expirada', className: 'text-faint bg-surface-2/40 border-divider' };
    case 'withdrawn':
      return { label: 'Retirada', className: 'text-faint bg-surface-2/40 border-divider' };
    default:
      return { label: invitation.status, className: 'text-muted bg-surface-off border-divider' };
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
    <div className="bg-surface-2/40 border border-divider rounded-xl p-3 space-y-2">
      <div className={`flex items-center gap-2 min-w-0 ${showStatusPill ? 'justify-between' : ''}`}>
        <div className="flex items-center gap-2 min-w-0">
          <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-[10px] font-black text-muted uppercase tracking-widest truncate">Oferta</span>
        </div>
        {showStatusPill && (
          <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border whitespace-normal text-right leading-tight max-w-[55%] ${badge.className}`}>
            {badge.label}
          </span>
        )}
      </div>

      <div className="space-y-1">
        {invitation.quotedPrice != null && (
          <UchQuoteBreakdown quote={quoteDisplayFromInvitation(invitation)} variant="compact" tone="neutral" />
        )}
        <p className="text-[10px] text-faint">
          Enviada: <span className="text-muted">{sentLabel}</span>
        </p>
        {techNotesDisplay && (
          <p className="text-[10px] text-muted italic">"{techNotesDisplay}"</p>
        )}
        {dentistFb && invitation.status === 'rejected' && (
          <p className="text-[10px] text-error/90 border border-error/20 rounded-lg px-2 py-1 mt-1">
            Comentario del dentista: {dentistFb}
          </p>
        )}
      </div>
    </div>
  );
}
