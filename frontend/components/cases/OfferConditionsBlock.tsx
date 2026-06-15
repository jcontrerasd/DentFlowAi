'use client';

import { CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { InvitationStatus } from '@/lib/db/actions/invitations';
import UchQuoteBreakdown from '@/components/cases/uch/UchQuoteBreakdown';
import { quoteDisplayFromInvitation } from '@/lib/uchQuoteDisplay';

interface BadgeStyle {
  label: string;
  className: string;
}

type OfferInvitation = {
  compensation?: number | null;
  quotedPrice?: number | null;
  deadlineDays?: number | null;
  deadlineHours?: number | null;
  respondedAt?: Date | string | null;
  status?: InvitationStatus | string | null;
  dentistRejectionFeedback?: string | null;
};

function badgeForInvitation(invitation: OfferInvitation): BadgeStyle {
  const fb = invitation.dentistRejectionFeedback?.trim();
  switch (invitation.status as InvitationStatus) {
    case 'accepted':
      return { label: 'Aceptada ✓', className: 'text-primary bg-primary-hl border-primary/20' };
    case 'rejected':
      return {
        label: 'Rechazada',
        className: fb
          ? 'text-error bg-error-hl border-error/20'
          : 'text-faint bg-surface-2/40 border-divider',
      };
    case 'expired':
      return { label: 'Expirada', className: 'text-faint bg-surface-2/40 border-divider' };
    case 'pending':
      return { label: 'Pendiente', className: 'text-muted bg-surface-off border-divider' };
    default:
      return { label: String(invitation.status ?? '—'), className: 'text-muted bg-surface-off border-divider' };
  }
}

interface OfferConditionsBlockProps {
  invitation: OfferInvitation;
}

export default function OfferConditionsBlock({ invitation }: OfferConditionsBlockProps) {
  const badge = badgeForInvitation(invitation);
  const dentistFb = invitation.dentistRejectionFeedback?.trim();
  const showStatusPill = invitation.status !== 'rejected' || !dentistFb;

  const sentLabel = invitation.respondedAt
    ? format(new Date(invitation.respondedAt), "d 'de' MMMM yyyy · HH:mm", { locale: es })
    : '—';

  const hasPrice = invitation.compensation != null || invitation.quotedPrice != null;

  return (
    <div className="bg-surface-2/40 border border-divider rounded-xl p-3 space-y-2">
      <div className={`flex items-center gap-2 min-w-0 ${showStatusPill ? 'justify-between' : ''}`}>
        <div className="flex items-center gap-2 min-w-0">
          <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-[10px] font-black text-muted uppercase tracking-widest truncate">Asignación</span>
        </div>
        {showStatusPill && (
          <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border whitespace-normal text-right leading-tight max-w-[55%] ${badge.className}`}>
            {badge.label}
          </span>
        )}
      </div>

      <div className="space-y-1">
        {hasPrice && (
          <UchQuoteBreakdown quote={quoteDisplayFromInvitation(invitation)} variant="compact" tone="neutral" />
        )}
        <p className="text-[10px] text-faint">
          {invitation.status === 'accepted' ? 'Aceptada' : 'Registrada'}: <span className="text-muted">{sentLabel}</span>
        </p>
        {dentistFb && invitation.status === 'rejected' && (
          <p className="text-[10px] text-error/90 border border-error/20 rounded-lg px-2 py-1 mt-1">
            Comentario del dentista: {dentistFb}
          </p>
        )}
      </div>
    </div>
  );
}
