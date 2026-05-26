import { describe, it, expect } from 'vitest';
import {
  GZIP_COMPRESSIBLE_EXTENSIONS,
  getFileExtension,
  isGzipCompressible,
  maybeGzipForUpload,
} from '@/lib/uploadCompression';

describe('uploadCompression', () => {
  describe('getFileExtension', () => {
    it('devuelve extensión en minúsculas con el punto', () => {
      expect(getFileExtension('Modelo.STL')).toBe('.stl');
      expect(getFileExtension('caso_v2.Ply')).toBe('.ply');
      expect(getFileExtension('archivo.tar.gz')).toBe('.gz');
    });

    it('null si no tiene extensión', () => {
      expect(getFileExtension('archivo-sin-extension')).toBeNull();
      expect(getFileExtension('')).toBeNull();
    });
  });

  describe('isGzipCompressible', () => {
    it('true solo para STL/PLY/OBJ', () => {
      expect(isGzipCompressible('a.stl')).toBe(true);
      expect(isGzipCompressible('A.PLY')).toBe(true);
      expect(isGzipCompressible('mesh.obj')).toBe(true);
    });

    it('false para imágenes, pdf, webp, json y otros', () => {
      expect(isGzipCompressible('foto.jpg')).toBe(false);
      expect(isGzipCompressible('thumb.webp')).toBe(false);
      expect(isGzipCompressible('doc.pdf')).toBe(false);
      expect(isGzipCompressible('data.json')).toBe(false);
      expect(isGzipCompressible('sin_extension')).toBe(false);
    });

    it('expone el catálogo de extensiones comprimibles', () => {
      expect([...GZIP_COMPRESSIBLE_EXTENSIONS]).toEqual(['.stl', '.ply', '.obj']);
    });
  });

  describe('maybeGzipForUpload', () => {
    it('passthrough cuando la extensión no es comprimible', async () => {
      const f = new File(['hello'], 'foto.jpg', { type: 'image/jpeg' });
      const out = await maybeGzipForUpload(f);
      expect(out.body).toBe(f);
      expect(out.contentEncoding).toBeUndefined();
    });

    it('passthrough si CompressionStream no existe', async () => {
      const original = (globalThis as any).CompressionStream;
      delete (globalThis as any).CompressionStream;
      try {
        const f = new File(['solid foo'], 'm.stl', { type: 'model/stl' });
        const out = await maybeGzipForUpload(f);
        expect(out.body).toBe(f);
        expect(out.contentEncoding).toBeUndefined();
      } finally {
        if (original) (globalThis as any).CompressionStream = original;
      }
    });

    it('comprime STL cuando CompressionStream y File.stream() están disponibles', async () => {
      const hasCS = typeof (globalThis as any).CompressionStream !== 'undefined';
      const probe = new File(['x'], 'p.stl', { type: 'model/stl' });
      if (!hasCS || typeof probe.stream !== 'function') {
        // jsdom puede no exponer estos APIs — skip silenciosamente.
        return;
      }
      const payload = 'solid foo\n' + 'facet normal 0 0 0\n'.repeat(200) + 'endsolid';
      const f = new File([payload], 'm.stl', { type: 'model/stl' });
      const out = await maybeGzipForUpload(f);
      expect(out.contentEncoding).toBe('gzip');
      expect(out.body).not.toBe(f);
      const compressedSize = (out.body as Blob).size;
      expect(compressedSize).toBeGreaterThan(0);
      expect(compressedSize).toBeLessThan(payload.length);
    });
  });
});
