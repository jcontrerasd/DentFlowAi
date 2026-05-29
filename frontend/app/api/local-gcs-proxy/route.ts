import { NextRequest, NextResponse } from 'next/server';
import { createGunzip } from 'zlib';
import { Readable } from 'stream';

const GCS_ENDPOINT = process.env.GCS_API_ENDPOINT;
const BUCKET = process.env.GCP_BUCKET_NAME;

export async function PUT(req: NextRequest) {
  if (!GCS_ENDPOINT || !BUCKET) {
    return NextResponse.json({ error: 'Not in local mode' }, { status: 400 });
  }

  const objectName = req.nextUrl.searchParams.get('name');
  if (!objectName) {
    return NextResponse.json({ error: 'Missing name param' }, { status: 400 });
  }

  const contentEncoding = req.headers.get('content-encoding') ?? '';
  const contentType = req.headers.get('content-type') || 'application/octet-stream';
  const rawBuffer = await req.arrayBuffer();

  // Decompress gzip before storing — fake-gcs doesn't do decompressive transcoding
  let finalBuffer: Buffer;
  if (contentEncoding.toLowerCase().includes('gzip')) {
    finalBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const gunzip = createGunzip();
      const readable = Readable.from(Buffer.from(rawBuffer));
      readable.pipe(gunzip);
      gunzip.on('data', (chunk: Buffer) => chunks.push(chunk));
      gunzip.on('end', () => resolve(Buffer.concat(chunks)));
      gunzip.on('error', reject);
    });
  } else {
    finalBuffer = Buffer.from(rawBuffer);
  }

  const fakeGcsUrl = `${GCS_ENDPOINT}/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;

  const res = await fetch(fakeGcsUrl, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: finalBuffer,
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text }, { status: res.status });
  }

  return new NextResponse(null, { status: 200 });
}
