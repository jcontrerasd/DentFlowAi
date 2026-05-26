'use client';

import { useMemo } from 'react';
import {
  CASE_LIST_FILTER_USE_TIMELINE_UI,
  TECH_FILTERABLE_KPI_IDS,
  TECH_KPI_FILTER_EXCEPTIONS,
  TECH_KPI_FILTER_MAIN_TIMELINE,
  techKpiFilterLabel,
} from '@/lib/cases/caseListFilters';
import { getTechKpiFichaPresentation } from '@/lib/cases/caseFichaStatusPresentation';
import type { TechKpiId } from '@/lib/dashboard/classifyCaseForDashboardKpi';
import CaseListTimelineFilter, {
  CaseListTimelineFilterWrap,
  type TimelineFilterItem,
} from '@/components/cases/CaseListTimelineFilter';

type TechnicianCaseKpiFilterFieldProps = {
  selected: TechKpiId[];
  onToggle: (kpi: TechKpiId) => void;
};

function buildTechKpiItems(ids: readonly TechKpiId[]): TimelineFilterItem[] {
  return ids.map((id) => {
    const { icon } = getTechKpiFichaPresentation(id);
    return {
      id,
      label: techKpiFilterLabel(id),
      icon,
    };
  });
}

export default function TechnicianCaseKpiFilterField({
  selected,
  onToggle,
}: TechnicianCaseKpiFilterFieldProps) {
  const mainItems = useMemo(
    () => buildTechKpiItems(TECH_KPI_FILTER_MAIN_TIMELINE),
    [],
  );
  const exceptionItems = useMemo(
    () => buildTechKpiItems(TECH_KPI_FILTER_EXCEPTIONS),
    [],
  );
  const allItems = useMemo(
    () => buildTechKpiItems(TECH_FILTERABLE_KPI_IDS),
    [],
  );

  if (!CASE_LIST_FILTER_USE_TIMELINE_UI) {
    return (
      <CaseListTimelineFilterWrap
        items={allItems}
        selected={selected}
        onToggle={(id) => onToggle(id as TechKpiId)}
      />
    );
  }

  return (
    <CaseListTimelineFilter
      mainItems={mainItems}
      exceptionItems={exceptionItems}
      selected={selected}
      onToggle={(id) => onToggle(id as TechKpiId)}
      mainAriaLabel="Mi participación en el caso"
      stepMinWidthClass="w-[4.75rem] sm:w-[6rem]"
    />
  );
}
