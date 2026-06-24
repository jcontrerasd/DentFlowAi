import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import DeliveryViewer3DModal from '@/components/cases/uch/DeliveryViewer3DModal';

type ModalProps = React.ComponentProps<typeof DeliveryViewer3DModal>;

function ControlledModal(props: Omit<ModalProps, 'qualityComment' | 'setQualityComment'> & { initialQualityComment?: string }) {
  const [qualityComment, setQualityComment] = useState(props.initialQualityComment ?? '');
  return <DeliveryViewer3DModal {...props} qualityComment={qualityComment} setQualityComment={setQualityComment} />;
}

vi.mock('@/lib/db/actions/annotations', () => ({
  listDeliveryAnnotationsAction: vi.fn().mockResolvedValue({ success: true, annotations: [] }),
  createDeliveryAnnotationAction: vi.fn().mockResolvedValue({
    success: true,
    annotation: { id: 'a1', text: 'test', coordinates: { x: 0, y: 0, z: 0 } },
  }),
}));

vi.mock('@/lib/db/actions/cases', () => ({
  getDeliverySignedFilesAction: vi.fn().mockResolvedValue({
    success: true,
    scans: ['http://test/model.stl'],
    attachments: [],
  }),
}));

vi.mock('@/components/DentalViewer3D', () => ({
  default: ({
    onAnnotate,
    children,
  }: {
    onAnnotate?: (c: object) => void;
    children?: React.ReactNode;
  }) => (
    <div data-testid="viewer3d" onClick={() => onAnnotate?.({ x: 0, y: 0, z: 0 })}>
      {children}
    </div>
  ),
}));

vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({ showError: vi.fn(), showSuccess: vi.fn() }),
}));

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  deliveryId: 'del-1',
  deliveryVersion: 1,
  caseId: 'case-1',
  caseNumber: 'DF-001',
  zipFiles: ['models/inferior.stl'],
  viewerRole: 'dentista' as const,
  canReview: false,
  canAnnotate: false,
  reviewComment: '',
  setReviewComment: vi.fn(),
  isSubmittingReview: false,
  isSubmittingRevision: false,
  onDownloadAll: vi.fn(),
  downloadingVersionId: null,
  qualityComment: '',
  setQualityComment: vi.fn(),
};

describe('DeliveryViewer3DModal — canAnnotate', () => {
  it('canAnnotate=false → click en modelo no muestra overlay de anotación', async () => {
    render(<DeliveryViewer3DModal {...baseProps} canAnnotate={false} />);
    await waitFor(() => expect(screen.getByTestId('viewer3d')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('viewer3d'));
    expect(screen.queryByText(/nueva anotación/i)).not.toBeInTheDocument();
  });

  it('canAnnotate=true → click en modelo muestra overlay de nueva anotación', async () => {
    render(<DeliveryViewer3DModal {...baseProps} canAnnotate />);
    await waitFor(() => expect(screen.getByTestId('viewer3d')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('viewer3d'));
    expect(screen.getByText(/nueva anotación/i)).toBeInTheDocument();
  });
});

describe('DeliveryViewer3DModal — footer QA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('footer QA oculto por defecto', async () => {
    render(<DeliveryViewer3DModal {...baseProps} />);
    await waitFor(() => expect(screen.getByTestId('viewer3d')).toBeInTheDocument());
    expect(screen.queryByText(/certificar entrega/i)).not.toBeInTheDocument();
  });

  it('canReviewQuality=true → muestra footer con los tres controles', async () => {
    render(
      <DeliveryViewer3DModal
        {...baseProps}
        viewerRole="calidad"
        canReviewQuality
        onCertifyQuality={vi.fn()}
        onQualityRequestChanges={vi.fn()}
        onDeriveQuality={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByTestId('viewer3d')).toBeInTheDocument());
    expect(screen.getByText(/certificar entrega/i)).toBeInTheDocument();
    expect(screen.getByText(/solicitar ajustes/i)).toBeInTheDocument();
    expect(screen.getByText(/derivar/i)).toBeInTheDocument();
  });

  it('"Solicitar ajustes" deshabilitado sin comentario, habilitado con texto', async () => {
    render(
      <ControlledModal
        {...baseProps}
        viewerRole="calidad"
        canReviewQuality
        onCertifyQuality={vi.fn()}
        onQualityRequestChanges={vi.fn()}
        onDeriveQuality={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByTestId('viewer3d')).toBeInTheDocument());
    const btn = screen.getByText(/solicitar ajustes/i).closest('button')!;
    expect(btn).toBeDisabled();

    const textarea = screen.getByPlaceholderText(/comentario para el técnico/i);
    fireEvent.change(textarea, { target: { value: 'ajustar bordes' } });
    expect(btn).not.toBeDisabled();
  });

  it('click "Certificar entrega" llama onCertifyQuality con el comentario', async () => {
    const onCertify = vi.fn().mockResolvedValue(undefined);
    render(
      <ControlledModal
        {...baseProps}
        viewerRole="calidad"
        canReviewQuality
        onCertifyQuality={onCertify}
        onQualityRequestChanges={vi.fn()}
        onDeriveQuality={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByTestId('viewer3d')).toBeInTheDocument());
    const textarea = screen.getByPlaceholderText(/comentario para el técnico/i);
    fireEvent.change(textarea, { target: { value: 'todo correcto' } });
    fireEvent.click(screen.getByText(/certificar entrega/i));
    await waitFor(() => expect(onCertify).toHaveBeenCalledWith('todo correcto'));
  });

  it('click "Solicitar ajustes" llama onQualityRequestChanges con el comentario', async () => {
    const onChanges = vi.fn().mockResolvedValue(undefined);
    render(
      <ControlledModal
        {...baseProps}
        viewerRole="calidad"
        canReviewQuality
        onCertifyQuality={vi.fn()}
        onQualityRequestChanges={onChanges}
        onDeriveQuality={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByTestId('viewer3d')).toBeInTheDocument());
    const textarea = screen.getByPlaceholderText(/comentario para el técnico/i);
    fireEvent.change(textarea, { target: { value: 'revisar margen distal' } });
    fireEvent.click(screen.getByText(/solicitar ajustes/i));
    await waitFor(() => expect(onChanges).toHaveBeenCalledWith('revisar margen distal'));
  });

  it('footer dentista visible con canReview=true, sin footer QA', async () => {
    render(
      <DeliveryViewer3DModal
        {...baseProps}
        canReview
        onApprove={vi.fn()}
        onRequestRevision={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByTestId('viewer3d')).toBeInTheDocument());
    expect(screen.getByText(/aprobar/i)).toBeInTheDocument();
    expect(screen.queryByText(/certificar entrega/i)).not.toBeInTheDocument();
  });

  it('con canReview=false y canReviewQuality=false: ningún footer visible', async () => {
    render(<DeliveryViewer3DModal {...baseProps} canReview={false} />);
    await waitFor(() => expect(screen.getByTestId('viewer3d')).toBeInTheDocument());
    expect(screen.queryByText(/aprobar/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/certificar entrega/i)).not.toBeInTheDocument();
  });

  it('comentario pre-llenado desde el hub aparece en el textarea del modal', async () => {
    render(
      <DeliveryViewer3DModal
        {...baseProps}
        viewerRole="calidad"
        canReviewQuality
        qualityComment="texto previo del hub"
        setQualityComment={vi.fn()}
        onCertifyQuality={vi.fn()}
        onQualityRequestChanges={vi.fn()}
        onDeriveQuality={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByTestId('viewer3d')).toBeInTheDocument());
    const textarea = screen.getByPlaceholderText(/comentario para el técnico/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe('texto previo del hub');
  });

  it('escribir en el textarea del modal llama setQualityComment', async () => {
    const setQualityComment = vi.fn();
    render(
      <DeliveryViewer3DModal
        {...baseProps}
        viewerRole="calidad"
        canReviewQuality
        qualityComment=""
        setQualityComment={setQualityComment}
        onCertifyQuality={vi.fn()}
        onQualityRequestChanges={vi.fn()}
        onDeriveQuality={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByTestId('viewer3d')).toBeInTheDocument());
    const textarea = screen.getByPlaceholderText(/comentario para el técnico/i);
    fireEvent.change(textarea, { target: { value: 'nuevo comentario' } });
    expect(setQualityComment).toHaveBeenCalledWith('nuevo comentario');
  });
});
