import { describe, expect, it } from 'vitest';
import { kpiStyleFromStatusKey } from '@/lib/dashboard/kpiStylesFromStatus';
import { STATUS_MAP } from '@/components/ui/StatusBadge';
import { DENTIST_DASHBOARD_METRICS, TECH_DASHBOARD_METRICS } from '@/lib/dashboard/dashboardMetricsConfig';

describe('kpiStylesFromStatusKey', () => {
  it('deriva text-* desde STATUS_MAP para estados de caso', () => {
    for (const key of Object.keys(STATUS_MAP)) {
      const style = kpiStyleFromStatusKey(key);
      const textClass = STATUS_MAP[key].className.match(/\btext-[\w.-]+/)?.[0];
      expect(style.color).toBe(textClass ?? style.color);
    }
  });

  it('invitacionPendiente usa teal como ficha', () => {
    const style = kpiStyleFromStatusKey('invitacionPendiente');
    expect(style.color).toBe('text-teal-400');
    expect(style.bg).toBe('bg-teal-500/10');
  });

  it('cada métrica del config tiene estilo resoluble', () => {
    for (const def of [...DENTIST_DASHBOARD_METRICS, ...TECH_DASHBOARD_METRICS]) {
      const style = kpiStyleFromStatusKey(def.statusColorKey);
      expect(style.color).toMatch(/^text-/);
      expect(style.bg).toMatch(/^bg-/);
    }
  });
});
