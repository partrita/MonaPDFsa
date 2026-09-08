import { performance } from 'node:perf_hooks';

function generateDummyBase64Pdf(pageCount = 100) {
  let objects = [];
  let kids = [];
  let objCount = 2;

  for (let i = 1; i <= pageCount; i++) {
    const pageObjId = ++objCount;
    const contentObjId = ++objCount;
    kids.push(`${pageObjId} 0 R`);
    objects.push(`${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentObjId} 0 R >>\nendobj\n`);
    const streamContent = `BT /F1 12 Tf 50 750 Td (Page ${i} Benchmark Test Content) Tj ET`;
    objects.push(`${contentObjId} 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`);
  }

  const pagesObj = `2 0 obj\n<< /Type /Pages /Count ${pageCount} /Kids [${kids.join(' ')}] >>\nendobj\n`;
  const catalogObj = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;

  let pdfBody = `%PDF-1.5\n${catalogObj}${pagesObj}${objects.join('')}`;
  let xrefOffset = pdfBody.length;
  let xref = `xref\n0 ${objCount + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objCount; i++) {
    xref += `0000000010 00000 n \n`;
  }
  let trailer = `trailer\n<< /Size ${objCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  let fullPdf = pdfBody + xref + trailer;

  return Buffer.from(fullPdf).toString('base64');
}

async function runBenchmark(pageCount = 100) {
  console.log(`\n======================================================`);
  console.log(`[Benchmark] PDF Thumbnail Generation (Pages: ${pageCount})`);
  console.log(`======================================================\n`);

  const base64Data = generateDummyBase64Pdf(pageCount);
  console.log(`PDF Base64 size: ${(base64Data.length / 1024).toFixed(1)} KB`);

  // 1. Simulate Legacy: Decode Base64 + Parse document header/structure on EVERY page
  const t0 = performance.now();
  for (let p = 1; p <= pageCount; p++) {
    const decoded = Buffer.from(base64Data, 'base64');
    const slice = decoded.subarray(0, Math.min(1024, decoded.length));
    const checksum = slice.reduce((a, b) => (a + b) & 0xff, 0);
  }
  const t1 = performance.now();
  const legacyTimeMs = t1 - t0;

  // 2. Simulate Batch: Decode Base64 ONCE + Parse document ONCE + Render all pages
  const t2 = performance.now();
  const decodedOnce = Buffer.from(base64Data, 'base64');
  for (let p = 1; p <= pageCount; p++) {
    const slice = decodedOnce.subarray(0, Math.min(1024, decodedOnce.length));
    const checksum = slice.reduce((a, b) => (a + b) & 0xff, 0);
  }
  const t3 = performance.now();
  const batchTimeMs = t3 - t2;

  const speedup = (legacyTimeMs / batchTimeMs).toFixed(2);
  const reductionPercent = (((legacyTimeMs - batchTimeMs) / legacyTimeMs) * 100).toFixed(1);

  console.log(`Legacy Approach (N decodes & document re-loads): ${legacyTimeMs.toFixed(2)} ms`);
  console.log(`Batch Approach  (1 decode & single instance)   : ${batchTimeMs.toFixed(2)} ms`);
  console.log(`------------------------------------------------------`);
  console.log(`Speedup: ${speedup}x faster (${reductionPercent}% time reduction)\n`);
}

runBenchmark(100);
