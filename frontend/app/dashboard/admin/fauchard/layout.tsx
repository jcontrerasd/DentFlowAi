/** Reclama espacio del padding global del dashboard (section p-10) en rutas Fauchard. */
export default function FauchardSectionLayout({ children }: { children: React.ReactNode }) {
  return <div className="-mx-6 -mt-4 mb-0 sm:-mx-8 lg:-mx-10 lg:-mt-6">{children}</div>;
}
