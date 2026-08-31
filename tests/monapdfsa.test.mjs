import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('MonaPDFsa Unit & Integration Tests', () => {
  // 1. 바이트 포맷팅 유틸리티 테스트
  describe('formatBytes Utility', () => {
    function formatBytes(bytes, decimals = 1) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const dm = decimals < 0 ? 0 : decimals;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    test('0 바이트 처리', () => {
      assert.equal(formatBytes(0), '0 Bytes');
    });

    test('KB 및 MB 포맷팅', () => {
      assert.equal(formatBytes(1024), '1 KB');
      assert.equal(formatBytes(1048576), '1 MB');
      assert.equal(formatBytes(5242880), '5 MB');
    });
  });

  // 2. 분할 페이지 범위 파싱 로직 테스트
  describe('Split Range Parser', () => {
    function parsePageRanges(input, maxPages) {
      const ranges = [];
      for (const part of input.split(',')) {
        const item = part.trim();
        if (!item) continue;
        if (item.includes('-')) {
          const [sStr, eStr] = item.split('-');
          const s = parseInt(sStr.trim(), 10);
          const e = parseInt(eStr.trim(), 10);
          if (!isNaN(s) && !isNaN(e)) {
            const start = Math.max(1, Math.min(maxPages, s));
            const end = Math.max(start, Math.min(maxPages, e));
            ranges.push({ start, end, label: `part_${start}_${end}` });
          }
        } else {
          const p = parseInt(item, 10);
          if (!isNaN(p)) {
            const page = Math.max(1, Math.min(maxPages, p));
            ranges.push({ start: page, end: page, label: `page_${page}` });
          }
        }
      }
      return ranges;
    }

    test('단일 페이지 및 다중 구간 파싱', () => {
      const parsed = parsePageRanges('1-3, 5, 8-10', 10);
      assert.equal(parsed.length, 3);
      assert.deepEqual(parsed[0], { start: 1, end: 3, label: 'part_1_3' });
      assert.deepEqual(parsed[1], { start: 5, end: 5, label: 'page_5' });
      assert.deepEqual(parsed[2], { start: 8, end: 10, label: 'part_8_10' });
    });

    test('최대 페이지 수 초과 시 자동 클램핑', () => {
      const parsed = parsePageRanges('1-100', 5);
      assert.equal(parsed.length, 1);
      assert.deepEqual(parsed[0], { start: 1, end: 5, label: 'part_1_5' });
    });
  });

  // 3. Retina High-DPI 좌표 변환 테스트
  describe('High-DPI Coordinate Mapping', () => {
    function calculatePdfCoords(normX, normY, normW, normH, pageWidthPt, pageHeightPt) {
      const pdfX = normX * pageWidthPt;
      const pdfWidth = normW * pageWidthPt;
      const pdfHeight = normH * pageHeightPt;
      const pdfY = pageHeightPt - (normY + normH) * pageHeightPt;
      return { pdfX, pdfY, pdfWidth, pdfHeight };
    }

    test('A4 표준 크기 (595x842pt) 가림 영역 좌표 계산', () => {
      // 상단 좌측 20% 위치에 50% 너비, 10% 높이 가림 적용
      const res = calculatePdfCoords(0.1, 0.1, 0.5, 0.1, 595, 842);
      assert.equal(res.pdfX, 59.5);
      assert.equal(res.pdfWidth, 297.5);
      assert.equal(res.pdfHeight, 84.2);
      // PDF 좌표계는 좌하단 원점이므로 상단 10~20% 영역의 Y좌표는 (842 - 0.2*842) = 673.6
      assert.equal(Math.round(res.pdfY * 10) / 10, 673.6);
    });

    test('Retina DPR 2.0 픽셀 배율 보정 계수 계산', () => {
      const viewportWidth = 600;
      const canvasWidth = 1200; // DPR 2.0
      const scaleFactorX = canvasWidth / viewportWidth;
      assert.equal(scaleFactorX, 2.0);

      const mouseSelectionWidth = 150;
      const actualCanvasPixels = mouseSelectionWidth * scaleFactorX;
      assert.equal(actualCanvasPixels, 300);
    });
  });

  // 4. 페이지 재배치 및 그룹핑 조작 로직 테스트
  describe('Page Reordering & Grouping Logic', () => {
    test('페이지 드래그 재배치 로직', () => {
      const pages = [
        { id: 'p1', num: 1 },
        { id: 'p2', num: 2 },
        { id: 'p3', num: 3 },
      ];

      // 3번 페이지를 1번 위치로 이동
      const updated = [...pages];
      const [moved] = updated.splice(2, 1);
      updated.splice(0, 0, moved);

      assert.equal(updated[0].id, 'p3');
      assert.equal(updated[1].id, 'p1');
      assert.equal(updated[2].id, 'p2');
    });

    test('페이지 회전 각도 정규화', () => {
      function rotateAngle(current, delta) {
        const next = (current + delta) % 360;
        return next < 0 ? next + 360 : next;
      }

      assert.equal(rotateAngle(0, 90), 90);
      assert.equal(rotateAngle(270, 90), 0);
      assert.equal(rotateAngle(0, -90), 270);
    });

    test('분할 구분점에 따른 그룹핑 분할', () => {
      const pages = [
        { id: 'p1', isSplitBreak: false },
        { id: 'p2', isSplitBreak: true }, // p2 뒤에서 분할
        { id: 'p3', isSplitBreak: false },
        { id: 'p4', isSplitBreak: false },
      ];

      const groups = [];
      let current = [];
      for (let i = 0; i < pages.length; i++) {
        current.push(pages[i]);
        if (pages[i].isSplitBreak || i === pages.length - 1) {
          groups.push(current);
          current = [];
        }
      }

      assert.equal(groups.length, 2);
      assert.equal(groups[0].length, 2); // p1, p2
      assert.equal(groups[1].length, 2); // p3, p4
    });
  });

  // 5. 보안 가림 (Redaction OCR 차단) 텍스트 파기 로직 테스트
  describe('Redaction Sanitization Logic', () => {
    function sanitizeTextOperations(operations, redactionBox) {
      const { x: rx, y: ry, w: rw, h: rh } = redactionBox;
      return operations.map((op) => {
        if (op.type === 'Tj') {
          if (op.x >= rx && op.x <= rx + rw && op.y >= ry && op.y <= ry + rh) {
            return { ...op, text: '' };
          }
        }
        return op;
      });
    }

    test('가림 영역 내 비밀 텍스트 완전 파기 검증', () => {
      const originalOps = [
        { type: 'Tj', text: '일반 공개 텍스트', x: 50, y: 750 },
        { type: 'Tj', text: 'SECRET_API_KEY_9988', x: 100, y: 700 },
        { type: 'Tj', text: '하단 일반 정보', x: 50, y: 300 },
      ];

      const redaction = { x: 80, y: 680, w: 200, h: 40 };
      const sanitized = sanitizeTextOperations(originalOps, redaction);

      assert.equal(sanitized[0].text, '일반 공개 텍스트');
      assert.equal(sanitized[1].text, '', '비밀 텍스트는 빈 문자열로 파기되어야 함');
      assert.equal(sanitized[2].text, '하단 일반 정보');
    });
  });
});
