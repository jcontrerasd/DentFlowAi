'use client';

import { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Circle,
  ClipboardList,
  Clock,
  Lock,
  RefreshCw,
  Settings,
  Users,
} from 'lucide-react';
import { statusIcon } from '@/components/ui/StatusBadge';
import {
  CASE_LIST_FILTER_USE_TIMELINE_UI,
  DENTIST_FILTERABLE_CASE_STATUSES,
  DENTIST_STATUS_FILTER_EXCEPTIONS,
  DENTIST_STATUS_FILTER_MAIN_TIMELINE,
  caseStatusFilterLabel,
} from '@/lib/cases/caseListFilters';
import CaseListTimelineFilter, {
  CaseListTimelineFilterWrap,
  type TimelineFilterItem,
} from '@/components/cases/CaseListTimelineFilter';

const TIMELINE_ICON_OVERRIDES: Record<string, LucideIcon> = {
  borrador: Circle,
  enEvaluacion: ClipboardList,
  publicado: Users,
  aceptadaPendienteInicio: Clock,
  enEjecucion: Settings,
};

const EXCEPTION_ICON_OVERRIDES: Record<string, LucideIcon> = {
  cambiosEnProceso: RefreshCw,
  cerrado: Lock,
};

function resolveFilterStatusIcon(status: string): LucideIcon {
  return (
    TIMELINE_ICON_OVERRIDES[status] ??
    EXCEPTION_ICON_OVERRIDES[status] ??
    statusIcon(status)
  );
}

function buildStatusItems(statuses: readonly string[]): TimelineFilterItem[] {
  return statuses.map((status) => ({
    id: status,
    label: caseStatusFilterLabel(status),
    icon: resolveFilterStatusIcon(status),
  }));
}

type DentistCaseStatusFilterFieldProps = {
  selected: string[];
  onToggle: (status: string) => void;
};

export default function DentistCaseStatusFilterField({
  selected,
  onToggle,
}: DentistCaseStatusFilterFieldProps) {
  const mainItems = useMemo(
    () => buildStatusItems(DENTIST_STATUS_FILTER_MAIN_TIMELINE),
    [],
  );
  const exceptionItems = useMemo(
    () => buildStatusItems(DENTIST_STATUS_FILTER_EXCEPTIONS),
    [],
  );
  const allItems = useMemo(
    () => buildStatusItems(DENTIST_FILTERABLE_CASE_STATUSES),
    [],
  );

  if (!CASE_LIST_FILTER_USE_TIMELINE_UI) {
    return (
      <CaseListTimelineFilterWrap
        items={allItems}
        selected={selected}
        onToggle={onToggle}
      />
    );
  }

  return (
    <CaseListTimelineFilter
      mainItems={mainItems}
      exceptionItems={exceptionItems}
      selected={selected}
      onToggle={onToggle}
      mainAriaLabel="Flujo del caso"
    />
  );
}
