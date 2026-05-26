import { motion } from 'framer-motion';
import { FileText, Calendar, ChevronRight } from 'lucide-react';
import React, { useState, useEffect, useMemo } from 'react';
import { useDeadlineMs, useRemainingMsUntil, formatCountdownHMS } from '@/lib/hooks/useRemainingUntil';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import STLThumbnail from '@/components/cases/STLThumbnail';
import {
  CaseHubUnreadBadge,
  CaseServiceTypeBadge,
  UchHubIcon,
} from '@/components/cases/CaseFichaHubAndServiceIcons';
import { formatCaseIdAndPac } from '@/lib/cases/caseDisplay';
import { getSignedUrlAction, getUploadUrlAction } from '@/lib/db/actions/cases';
import { updateFileThumbnailAction } from '@/lib/db/actions/files';
import StatusBadge from '@/components/ui/StatusBadge';
import { DENTIST_FICHA_STRIPE } from '@/lib/cases/caseFichaStatusPresentation';
import CaseViewerStatusStripe from '@/components/cases/CaseViewerStatusStripe';
import type { CaseViewerStatusInput } from '@/lib/cases/caseViewerStatusPresentation';
import type { InvitationStatusForKpi } from '@/lib/dashboard/classifyCaseForDashboardKpi';
import type { ServerClockAnchor } from '@/lib/deadlineMs';
import { dispatchCaseHubToggle } from '@/lib/caseHubToggleEvent';

/** Marco de ficha sobre fondo oscuro: borde + aro interior muy suave. */
const CASE_CARD_SHELL =
  'bg-slate-900/50 border border-slate-600/35 rounded-[1.5rem] shadow-sm shadow-black/40 ring-1 ring-inset ring-white/[0.07] transition-colors duration-150 hover:bg-white/5 hover:border-teal-500/35 hover:ring-teal-500/10 focus-within:outline-none focus-within:ring-2 focus-within:ring-teal-400/40';

interface MarketplaceCaseCardProps {
  c: any;
  myBid?: any;
  invitation?: any;
  deletingBidId?: string | null;
  submitting?: boolean;
  onSetDeletingBidId?: (id: string | null) => void;
  onDeleteBid?: (id: string) => void;
  onSelectCase: (c: any) => void;
  isLink?: boolean;
  isDentist?: boolean;
  /** Pendientes por caso (servidor): UCH + bump de responsabilidad / turno. */
  hubUchUnread?: number;
  /** Ancla de reloj del servidor (listCases / detalle) para countdown alineado. */
  serverClockAnchor?: ServerClockAnchor | null;
}

export default function MarketplaceCaseCard({
  c,
  myBid,
  invitation,
  deletingBidId,
  submitting,
  onSetDeletingBidId,
  onDeleteBid,
  onSelectCase,
  isLink = false,
  isDentist = false,
  hubUchUnread = 0,
  serverClockAnchor = null,
}: MarketplaceCaseCardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { userProfile: authUserProfile } = useAuth();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [stlUrl, setStlUrl] = useState<string | null>(null);

  const inviteExpirySource = invitation?.expiresAt || c.invitationExpiresAt;
  const inviteDeadlineMs = useDeadlineMs(inviteExpirySource ?? null);
  const remaining = useRemainingMsUntil(inviteDeadlineMs, serverClockAnchor);
  const countdownText =
    remaining <= 0 ? null : formatCountdownHMS(remaining);

  const proposalSource =
    isDentist && String(c.status ?? '') === 'propuestaLista' && c.proposalExpiresAt ? c.proposalExpiresAt : null;
  const proposalDeadlineMs = useDeadlineMs(proposalSource);
  const proposalRemaining = useRemainingMsUntil(proposalDeadlineMs, serverClockAnchor);
  const proposalCountdownText = proposalRemaining < 0 ? null : formatCountdownHMS(proposalRemaining);

  const unreadCount = useMemo(() => {
    return hubUchUnread ?? 0;
  }, [hubUchUnread]);

  const techStatusInput: CaseViewerStatusInput | null = useMemo(() => {
    if (isDentist || !authUserProfile?.id) return null;
    const invStatus = (myBid?.status ?? null) as InvitationStatusForKpi;
    return {
      caseStatus: String(c.status ?? ''),
      assignedTechnicianId: c.assignedTechnicianId ?? null,
      technicianUserId: String(authUserProfile.id),
      invitationStatus: invStatus,
    };
  }, [isDentist, authUserProfile?.id, myBid?.status, c.status, c.assignedTechnicianId]);

  const techCountdownRight =
    countdownText &&
    techStatusInput &&
    (techStatusInput.invitationStatus === 'pending' ||
      (techStatusInput.invitationStatus === 'quoted' &&
        techStatusInput.caseStatus === 'enEvaluacion') ||
      ((techStatusInput.caseStatus === 'enEvaluacion' ||
        techStatusInput.caseStatus === 'propuestaLista') &&
        (techStatusInput.invitationStatus === 'accepted' ||
          techStatusInput.invitationStatus === 'confirmed'))) ? (
      <div className="font-mono text-[11px] tabular-nums tracking-normal text-amber-400 opacity-90">
        {countdownText}
      </div>
    ) : null;

  useEffect(() => {
    const fetchPreview = async () => {
      if (c._thumbnailUrl) {
        if (c._isStaticThumbnail) { setImageUrl(c._thumbnailUrl); return; }
        const files = c.files || c.files_on_clinicalCase || [];
        const isStl = files.some(
          (f: any) => (f.category === 'scan' || f.category === 'design_upload') && c._thumbnailUrl.includes(f.gcsPath),
        );
        if (isStl) setStlUrl(c._thumbnailUrl);
        else setImageUrl(c._thumbnailUrl);
        return;
      }
      const files = c.files || c.files_on_clinicalCase || [];
      if (!files.length) return;
      const previewFile = files.find((f: any) => f.category === 'photo' || f.category === 'reference');
      if (previewFile?.gcsPath) {
        const url = await getSignedUrlAction(previewFile.gcsPath);
        setImageUrl(url);
        return;
      }
      const stlFile = files.find((f: any) => f.category === 'scan' || f.category === 'design_upload');
      if (stlFile?.gcsPath) {
        const url = await getSignedUrlAction(stlFile.gcsPath);
        setStlUrl(url);
      }
    };
    fetchPreview();
  }, [c]);

  const handleLazyThumbnail = async (dataUrl: string) => {
    if (c._isStaticThumbnail) return;
    try {
      const files = c.files || c.files_on_clinicalCase || [];
      const scanFile = files.find(
        (f: any) => (f.category === 'scan' || f.category === 'design_upload') && !f.thumbnailPath,
      );
      if (scanFile) {
        const thumbBlob = await (await fetch(dataUrl)).blob();
        const thumbGcsPath = scanFile.gcsPath
          .replace('/scans/', '/thumbnails/')
          .replace('/design/', '/thumbnails/')
          .split('.').slice(0, -1).join('.') + '.webp';
        const uploadUrl = await getUploadUrlAction(thumbGcsPath, 'image/webp');
        if (uploadUrl) {
          await fetch(uploadUrl, { method: 'PUT', body: thumbBlob, headers: { 'Content-Type': 'image/webp' } });
          await updateFileThumbnailAction(scanFile.id, thumbGcsPath);
        }
      }
    } catch (err) { console.error("[LazyThumbnail] Error:", err); }
  };

  const hubAriaLabel =
    unreadCount > 0
      ? `Centro de control: ${unreadCount} mensaje${unreadCount === 1 ? '' : 's'} sin leer`
      : pathname === `/dashboard/cases/${c.id}`
        ? 'Abrir o cerrar Centro de control'
        : 'Abrir Centro de control';

  const uchHubOpenButton = (
    <motion.div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const casePath = `/dashboard/cases/${c.id}`;
          if (pathname === casePath) {
            dispatchCaseHubToggle(c.id);
            return;
          }
          router.push(`${casePath}?openHub=1`);
        }}
        className="flex h-[42px] w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-950/80 text-slate-400 transition-colors duration-150 hover:bg-white/5 hover:border-teal-500/40 hover:text-teal-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/40"
        title={hubAriaLabel}
        aria-label={hubAriaLabel}
      >
        <UchHubIcon className="h-4 w-4" />
      </button>
      <CaseHubUnreadBadge count={unreadCount} />
    </motion.div>
  );

  const gestionarButtonClass =
    'flex min-w-0 flex-1 items-center justify-center gap-1 px-2 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-[9px] font-black uppercase tracking-widest text-white hover:bg-teal-600 hover:border-teal-600 transition-all group/btn';

  return (
    <motion.div 
      key={c.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`${CASE_CARD_SHELL} transition-all group relative overflow-hidden backdrop-blur-sm flex flex-col h-full min-w-[260px]`}
    >
      <div className="p-4 flex flex-col flex-1 text-sm">
        <div className="mb-4 flex-1">
          <div className="flex gap-4 items-start">
            {/* Mini Thumbnail */}
            <div className="w-16 h-16 bg-slate-950 rounded-xl flex-shrink-0 border border-slate-800/40 relative overflow-hidden flex items-center justify-center">
              {imageUrl && (imageUrl.startsWith('http') || imageUrl.startsWith('/')) ? (
                <Image src={imageUrl} alt={c.internalName} fill unoptimized className="object-cover group-hover:scale-105 transition-transform duration-500" />
              ) : stlUrl ? (
                <div className="absolute inset-0 overflow-hidden rounded-[10px] bg-slate-900/70">
                  <STLThumbnail url={stlUrl} onGenerated={handleLazyThumbnail} />
                </div>
              ) : (
                <FileText className="w-5 h-5 text-slate-700" />
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                <span className="text-[9px] font-black uppercase tracking-widest text-teal-500 bg-teal-500/10 px-1.5 py-0.5 rounded-md">
                  {c.restorationType || 'General'}
                </span>
                <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md ${c.urgency === 'Alta' || c.urgency === 'Urgente' ? 'bg-rose-500/10 text-rose-400' : 'bg-blue-500/10 text-blue-400'}`}>
                  Prioridad {c.urgency || 'Normal'}
                </span>
                <CaseServiceTypeBadge serviceType={c.serviceType} />
              </div>
              <h3 className="text-lg serif-font text-white group-hover:text-teal-400 transition-colors uppercase tracking-tight line-clamp-2 leading-tight">
                {c.internalName || c.restorationType || 'Caso Dental'}
              </h3>
              <p className="text-slate-500 text-[10px] mt-1 font-bold uppercase tracking-wide">
                {formatCaseIdAndPac(c.caseNumber, c.patientIdAnon)}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2 mb-6">
          <div className="flex items-center gap-2 text-[10px] text-slate-400">
             <Calendar className="w-3.5 h-3.5 text-teal-500/50" />
             <span>Publicado: {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '---'}</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-400">
             <FileText className="w-3.5 h-3.5 text-teal-500/50" />
             <span>Material: {c.material || 'No especificado'}</span>
          </div>
        </div>

        {!isDentist && techStatusInput ? (
          <div className="w-full flex flex-col gap-2">
            <CaseViewerStatusStripe
              input={techStatusInput}
              invitedAt={invitation?.invitedAt ?? myBid?.invitedAt ?? myBid?.createdAt}
              countdownRight={techCountdownRight}
            />
            <motion.div className="flex w-full gap-2">
              {uchHubOpenButton}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onSelectCase(c);
                }}
                className={gestionarButtonClass}
              >
                Gestionar <ChevronRight className="w-3 h-3 shrink-0 group-hover/btn:translate-x-1 transition-transform" />
              </button>
            </motion.div>
          </div>
        ) : isDentist ? (
          <div className="w-full flex flex-col gap-2">
            <div
              className={`w-full h-10 flex items-center justify-between px-3 rounded-xl bg-slate-950 border text-[9px] font-black uppercase tracking-widest text-slate-500 ${
                c.status === 'enEvaluacion'
                  ? 'border-amber-500/30 shadow-[0_0_15px_-5px_rgba(245,158,11,0.2)]'
                  : c.status === 'propuestaLista' && proposalDeadlineMs != null
                    ? 'border-amber-500/30 shadow-[0_0_15px_-5px_rgba(245,158,11,0.2)]'
                    : 'border-slate-800'
              }`}
            >
              {c.status === 'enEvaluacion' ? (
                <>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border bg-amber-500/15 text-amber-300 border-amber-500/30">
                    <DENTIST_FICHA_STRIPE.evaluandoCaso.icon className={`w-3 h-3 mr-1 ${remaining > 0 ? 'animate-pulse' : ''}`} />
                    {DENTIST_FICHA_STRIPE.evaluandoCaso.label}
                  </span>
                  {countdownText && (
                    <div className="font-mono text-[11px] tabular-nums tracking-normal text-amber-400 opacity-90">{countdownText}</div>
                  )}
                </>
              ) : c.status === 'propuestaLista' && proposalDeadlineMs != null ? (
                <>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border bg-amber-500/15 text-amber-300 border-amber-500/30">
                    <DENTIST_FICHA_STRIPE.elegirOferta.icon className={`w-3 h-3 mr-1 ${proposalRemaining > 0 ? 'animate-pulse' : ''}`} />
                    {DENTIST_FICHA_STRIPE.elegirOferta.label}
                  </span>
                  {proposalCountdownText && (
                    <div className="font-mono text-[11px] tabular-nums tracking-normal text-amber-400 opacity-90">
                      {proposalCountdownText}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <StatusBadge status={c.status} />
                  {c.status === 'publicado' && (
                    <div className="text-teal-400">
                      {(() => {
                        const count = c.bids?.filter((b: any) => b.status === 'pending').length || 0;
                        return `${count} ${count === 1 ? 'Oferta' : 'Ofertas'}`;
                      })()}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex w-full gap-2">
              {uchHubOpenButton}
              <button onClick={(e) => { e.preventDefault(); onSelectCase(c); }} className={gestionarButtonClass}>
                Gestionar <ChevronRight className="w-3 h-3 shrink-0 group-hover/btn:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
