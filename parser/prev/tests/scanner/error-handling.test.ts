// @ts-check
/**
 * Tests for scanner error handling and callback semantics
 */

import { beforeEach, describe, expect, test } from 'vitest';

import { createScanner } from '../../scanner.js';
import { SyntaxKind, TokenFlags, ScannerErrorCode } from '../../../token-types.js';

describe('Scanner Error Handling', () => {
  let scanner: ReturnType<typeof createScanner>;

  beforeEach(() => {
    scanner = createScanner();
  });

  describe('Error callback semantics', () => {
    test('lookAhead suppresses error callback emissions', () => {
      const events: Array<{ start: number; end: number; code: ScannerErrorCode; message: string }> = [];
      scanner.setOnError((start, end, code, message) => {
        events.push({ start, end, code, message });
      });
      scanner.setText('<!-- Unterminated');
      const res = scanner.lookAhead(() => {
        scanner.scan(); // would emit unterminated comment error
        return true;
      });
      expect(res).toBe(true);
      expect(events.length).toBe(0);
    });

    test('tryScan false suppresses and discards queued errors', () => {
      const events: Array<{ start: number; end: number; code: ScannerErrorCode; message: string }> = [];
      scanner.setOnError((start, end, code, message) => {
        events.push({ start, end, code, message });
      });
      scanner.setText('<!-- Unterminated');
      const ok = scanner.tryScan(() => {
        scanner.scan(); // would queue error
        return false; // cause rollback
      });
      expect(ok).toBe(false);
      // No events emitted because tryScan failed
      expect(events.length).toBe(0);
    });

    test('tryScan true flushes queued errors once', () => {
      const events: Array<{ start: number; end: number; code: ScannerErrorCode; message: string }> = [];
      scanner.setOnError((start, end, code, message) => {
        events.push({ start, end, code, message });
      });
      scanner.setText('<!-- Unterminated');
      const ok = scanner.tryScan(() => {
        scanner.scan(); // queue error inside speculation
        return true; // commit
      });
      expect(ok).toBe(true);
      expect(events.length).toBe(1);
      expect(events[0].code).toBe(ScannerErrorCode.UnterminatedComment);
    });

    test('reScan does not duplicate error callback emission', () => {
      const events: Array<{ start: number; end: number; code: ScannerErrorCode; message: string }> = [];
      scanner.setOnError((start, end, code, message) => {
        events.push({ start, end, code, message });
      });
      scanner.setText('<!-- Unterminated');
      // First scan emits error once
      const k1 = scanner.scan();
      expect(k1).toBe(SyntaxKind.HtmlComment);
      expect(events.length).toBe(1);
      // Rescan from same token start should not re-emit the same error
      const k2 = scanner.reScanLessThanToken();
      expect(k2 === SyntaxKind.HtmlComment || k2 === SyntaxKind.LessThanToken).toBeTruthy();
      expect(events.length).toBe(1);
    });
  });

  describe('Error Handling', () => {
    test('reports unterminated HTML comment', () => {
      scanner.setText('<!-- unclosed comment');
      scanner.scan();
      expect(scanner.isUnterminated()).toBe(true);
      expect(scanner.getErrorMessage()).toContain('Unterminated HTML comment');
    });

    test('reports unterminated CDATA', () => {
      scanner.setText('<![CDATA[unclosed');
      scanner.scan();
      expect(scanner.isUnterminated()).toBe(true);
      expect(scanner.getErrorMessage()).toContain('Unterminated CDATA');
    });
  });
});
