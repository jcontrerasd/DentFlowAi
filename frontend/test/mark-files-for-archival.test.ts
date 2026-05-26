import { describe, it, expect, vi, beforeEach } from 'vitest';

const setMetadataMock = vi.fn();
const fileMock = vi.fn(() => ({ setMetadata: setMetadataMock }));
const bucketMock = { file: fileMock };

vi.mock('@google-cloud/storage', () => ({
  Storage: class {
    bucket() {
      return bucketMock;
    }
  },
}));

import GCPStorageService from '@/lib/services/gcp-storage';

describe('GCPStorageService.markFilesForArchival', () => {
  beforeEach(() => {
    setMetadataMock.mockReset();
    fileMock.mockClear();
    setMetadataMock.mockResolvedValue([{}]);
  });

  it('llama setMetadata con customTime ISO en cada path único', async () => {
    await GCPStorageService.markFilesForArchival([
      'organizations/o1/cases/c1/scans/a.stl',
      'organizations/o1/cases/c1/scans/b.stl',
      'organizations/o1/cases/c1/scans/a.stl', // duplicado
    ]);

    expect(fileMock).toHaveBeenCalledTimes(2);
    expect(setMetadataMock).toHaveBeenCalledTimes(2);
    for (const call of setMetadataMock.mock.calls) {
      const arg = call[0] as { customTime: string };
      expect(arg.customTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it('normaliza prefijo gs://bucket/ antes de llamar a file()', async () => {
    await GCPStorageService.markFilesForArchival(['gs://dentflowai-assets-prod/foo/bar.stl']);
    expect(fileMock).toHaveBeenCalledWith('foo/bar.stl');
  });

  it('no falla si setMetadata rechaza en uno de los archivos', async () => {
    setMetadataMock
      .mockResolvedValueOnce([{}])
      .mockRejectedValueOnce(new Error('boom'));

    await expect(
      GCPStorageService.markFilesForArchival(['a.stl', 'b.stl']),
    ).resolves.toBeUndefined();
  });

  it('no-op cuando la lista está vacía o solo trae strings vacíos', async () => {
    await GCPStorageService.markFilesForArchival([]);
    await GCPStorageService.markFilesForArchival(['', '   ']);
    expect(setMetadataMock).not.toHaveBeenCalled();
  });
});

describe('GCPStorageService.clearArchivalMark', () => {
  beforeEach(() => {
    setMetadataMock.mockReset();
    fileMock.mockClear();
    setMetadataMock.mockResolvedValue([{}]);
  });

  it('llama setMetadata con customTime null en cada path único', async () => {
    await GCPStorageService.clearArchivalMark([
      'organizations/o1/cases/c1/scans/a.stl',
      'organizations/o1/cases/c1/scans/a.stl',
      'organizations/o1/cases/c1/scans/b.stl',
    ]);
    expect(fileMock).toHaveBeenCalledTimes(2);
    expect(setMetadataMock).toHaveBeenCalledTimes(2);
    for (const call of setMetadataMock.mock.calls) {
      expect((call[0] as { customTime: unknown }).customTime).toBeNull();
    }
  });

  it('no-op con lista vacía', async () => {
    await GCPStorageService.clearArchivalMark([]);
    expect(setMetadataMock).not.toHaveBeenCalled();
  });

  it('no lanza si una metadata rechaza', async () => {
    setMetadataMock
      .mockResolvedValueOnce([{}])
      .mockRejectedValueOnce(new Error('boom'));
    await expect(
      GCPStorageService.clearArchivalMark(['a.stl', 'b.stl']),
    ).resolves.toBeUndefined();
  });
});
