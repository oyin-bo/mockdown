/**
 * Token types for Scanner2 - New Parser-Scanner Architecture
 *
 * This is a simplified, focused token set for the new scanner architecture.
 * Unlike the original token-types.ts, this focuses only on tokens needed
 * for the stage-based Scanner2 implementation.
 */
/**
 * Scanner error codes for Scanner2 diagnostics
 */
export var ScannerErrorCode2;
(function (ScannerErrorCode2) {
    ScannerErrorCode2[ScannerErrorCode2["None"] = 0] = "None";
    ScannerErrorCode2[ScannerErrorCode2["UnexpectedEndOfFile"] = 1] = "UnexpectedEndOfFile";
    ScannerErrorCode2[ScannerErrorCode2["InvalidCharacter"] = 2] = "InvalidCharacter";
    ScannerErrorCode2[ScannerErrorCode2["InvalidRollbackPosition"] = 3] = "InvalidRollbackPosition";
    ScannerErrorCode2[ScannerErrorCode2["InvalidRollbackType"] = 4] = "InvalidRollbackType";
})(ScannerErrorCode2 || (ScannerErrorCode2 = {}));
