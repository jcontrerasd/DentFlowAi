import React from "react";
import { COLORS } from "../style";
import { Pill } from "./Pill";

export type CaseStatus =
  | "borrador"
  | "enEvaluacion"
  | "propuestaLista"
  | "aceptada"
  | "enEjecucion"
  | "enRevision"
  | "enFabricacion"
  | "enviado"
  | "completado";

const MAP: Record<CaseStatus, { label: string; tone: "neutral" | "active" | "warn" | "good" }> = {
  borrador: { label: "Borrador", tone: "neutral" },
  enEvaluacion: { label: "En evaluación", tone: "active" },
  propuestaLista: { label: "Propuesta lista", tone: "warn" },
  aceptada: { label: "Esperando inicio", tone: "active" },
  enEjecucion: { label: "En ejecución", tone: "active" },
  enRevision: { label: "En revisión", tone: "warn" },
  enFabricacion: { label: "En fabricación", tone: "active" },
  enviado: { label: "Enviado", tone: "active" },
  completado: { label: "Completado", tone: "good" },
};

const TONES = {
  neutral: { fg: COLORS.muted2, bg: "rgba(148,163,184,.12)", border: COLORS.line2 },
  active: { fg: COLORS.teal, bg: "rgba(45,212,191,.13)", border: "rgba(45,212,191,.35)" },
  warn: { fg: "#fdba74", bg: "rgba(249,115,22,.15)", border: "rgba(249,115,22,.4)" },
  good: { fg: "#bbf7d0", bg: "rgba(34,197,94,.15)", border: "rgba(34,197,94,.4)" },
};

export const StatusBadge: React.FC<{ status: CaseStatus; style?: React.CSSProperties }> = ({
  status,
  style,
}) => {
  const { label, tone } = MAP[status];
  const t = TONES[tone];
  return (
    <Pill fg={t.fg} bg={t.bg} border={t.border} style={style}>
      {label}
    </Pill>
  );
};
