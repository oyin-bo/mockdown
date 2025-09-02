/**
 * Core Parser Implementation
 * Recursive descent parser for Markdown with native HTML support
 */
import { createScanner } from './scanner.js';
import { createDocumentNode, createParagraphNode, createHeadingNode, createTextNode, createHtmlElementNode, createWhitespaceSeparationNode, setChildren } from './ast-factory.js';
import { isAtLineStart, isBlankLine, isListMarkerAhead, isThematicBreakAhead, isSetextUnderlineAhead } from './parser-utils.js';
export function createParser() {
    return {
        parseDocument
    };
}
function parseDocument(source, options = {}) {
    const scanner = createScanner();
    scanner.setText(source);
    const context = {
        scanner,
        diagnostics: [],
        options: {
            parentLinking: options.parentLinking ?? false,
            errorRecovery: options.errorRecovery ?? true
        }
    };
    const filePos = scanner.getTokenStart();
    scanner.scan(); // Initialize first token
    const children = [];
    // Parse block-level constructs
    while (scanner.getToken() !== 1 /* SyntaxKind.EndOfFileToken */) {
        const block = parseBlockConstruct(context);
        if (block) {
            children.push(block);
            setChildren(block, [block], context.options.parentLinking ?? false);
        }
    }
    const doc = createDocumentNode(filePos, scanner.getTokenEnd(), children);
    // Set line starts for source mapping
    doc.lineStarts = computeLineStarts(source);
    return {
        ast: doc,
        diagnostics: context.diagnostics
    };
}
function parseBlockConstruct(context) {
    const { scanner } = context;
    const token = scanner.getToken();
    const flags = scanner.getTokenFlags();
    // Skip whitespace separation and create nodes for blank lines
    if (isBlankLine(scanner)) {
        return parseWhitespaceSeparation(context);
    }
    // HTML elements
    if (token === 2 /* SyntaxKind.LessThanToken */ || token === 3 /* SyntaxKind.LessThanSlashToken */ || token === 6 /* SyntaxKind.HtmlText */) {
        return parseHtmlElement(context);
    }
    // ATX headings at line start
    if ((flags & 32 /* TokenFlags.IsAtLineStart */) && token === 11 /* SyntaxKind.HashToken */) {
        return parseAtxHeading(context);
    }
    // Try other block constructs (lists, thematic breaks, etc.)
    if (isAtLineStart(scanner)) {
        if (isListMarkerAhead(scanner)) {
            // TODO: Implement list parsing in phase 4
            return parseParagraph(context);
        }
        if (isThematicBreakAhead(scanner)) {
            // TODO: Implement thematic break parsing in phase 4
            return parseParagraph(context);
        }
    }
    // Check for setext heading
    if (isSetextUnderlineAhead(scanner)) {
        return parseSetextHeading(context);
    }
    // Default to paragraph
    return parseParagraph(context);
}
function parseWhitespaceSeparation(context) {
    const { scanner } = context;
    const start = scanner.getTokenStart();
    let count = 0;
    while (isBlankLine(scanner)) {
        count++;
        scanner.scan();
    }
    const end = scanner.getTokenStart();
    return createWhitespaceSeparationNode(start, end, count);
}
function parseAtxHeading(context) {
    const { scanner } = context;
    const start = scanner.getTokenStart();
    // Count hash marks to determine level
    const hashText = scanner.getTokenText();
    const level = Math.min(hashText.length, 6);
    scanner.scan(); // consume hash token
    // Skip optional space after hashes
    if (scanner.getToken() === 31 /* SyntaxKind.WhitespaceTrivia */) {
        scanner.scan();
    }
    // Parse inline content until end of line
    const children = parseInlineContent(context, 32 /* SyntaxKind.NewLineTrivia */);
    // Consume newline if present
    if (scanner.getToken() === 32 /* SyntaxKind.NewLineTrivia */) {
        scanner.scan();
    }
    const end = scanner.getTokenStart();
    const heading = createHeadingNode(start, end, level, children);
    if (context.options.parentLinking) {
        setChildren(heading, children, true);
    }
    return heading;
}
function parseSetextHeading(context) {
    const { scanner } = context;
    const start = scanner.getTokenStart();
    // Parse the heading content (current line)
    const children = parseInlineContent(context, 32 /* SyntaxKind.NewLineTrivia */);
    // Consume newline
    if (scanner.getToken() === 32 /* SyntaxKind.NewLineTrivia */) {
        scanner.scan();
    }
    // Parse underline to determine level
    const underlineToken = scanner.getToken();
    const level = underlineToken === 19 /* SyntaxKind.EqualsToken */ ? 1 : 2;
    // Consume entire underline (may be multiple tokens if scanner splits them)
    while (scanner.getToken() === underlineToken && scanner.getToken() !== 1 /* SyntaxKind.EndOfFileToken */) {
        scanner.scan();
    }
    // Consume trailing newline if present
    if (scanner.getToken() === 32 /* SyntaxKind.NewLineTrivia */) {
        scanner.scan();
    }
    const end = scanner.getTokenStart();
    const heading = createHeadingNode(start, end, level, children);
    if (context.options.parentLinking) {
        setChildren(heading, children, true);
    }
    return heading;
}
function parseParagraph(context) {
    const { scanner } = context;
    const start = scanner.getTokenStart();
    const children = parseInlineContent(context, 32 /* SyntaxKind.NewLineTrivia */);
    // Consume trailing newline if present
    if (scanner.getToken() === 32 /* SyntaxKind.NewLineTrivia */) {
        scanner.scan();
    }
    const end = scanner.getTokenStart();
    const paragraph = createParagraphNode(start, end, children);
    if (context.options.parentLinking) {
        setChildren(paragraph, children, true);
    }
    return paragraph;
}
function parseInlineContent(context, stopToken) {
    const { scanner } = context;
    const children = [];
    while (scanner.getToken() !== 1 /* SyntaxKind.EndOfFileToken */) {
        if (stopToken && scanner.getToken() === stopToken) {
            break;
        }
        const inline = parseInlineConstruct(context);
        if (inline) {
            children.push(inline);
        }
        else {
            // If we can't parse anything, consume one token as text to avoid infinite loop
            const start = scanner.getTokenStart();
            scanner.scan();
            const end = scanner.getTokenStart();
            children.push(createTextNode(start, end));
        }
    }
    return children;
}
function parseInlineConstruct(context) {
    const { scanner } = context;
    const token = scanner.getToken();
    // HTML elements
    if (token === 2 /* SyntaxKind.LessThanToken */ || token === 3 /* SyntaxKind.LessThanSlashToken */) {
        return parseHtmlElement(context);
    }
    // Emphasis and strong (basic implementation)
    if (token === 14 /* SyntaxKind.AsteriskToken */ || token === 15 /* SyntaxKind.UnderscoreToken */) {
        return parseEmphasisOrStrong(context);
    }
    // Default: parse as text
    return parseTextRun(context);
}
function parseEmphasisOrStrong(context) {
    // TODO: Implement proper delimiter stack algorithm in phase 2
    // For now, just parse as text
    return parseTextRun(context);
}
function parseTextRun(context) {
    const { scanner } = context;
    const start = scanner.getTokenStart();
    // Consume tokens until we hit something that needs special parsing
    while (scanner.getToken() !== 1 /* SyntaxKind.EndOfFileToken */ &&
        scanner.getToken() !== 32 /* SyntaxKind.NewLineTrivia */ &&
        scanner.getToken() !== 2 /* SyntaxKind.LessThanToken */ &&
        scanner.getToken() !== 3 /* SyntaxKind.LessThanSlashToken */) {
        scanner.scan();
    }
    const end = scanner.getTokenStart();
    return createTextNode(start, end);
}
function parseHtmlElement(context) {
    const { scanner } = context;
    const start = scanner.getTokenStart();
    // Handle HtmlText tokens (complete HTML tags)
    if (scanner.getToken() === 6 /* SyntaxKind.HtmlText */) {
        const text = scanner.getTokenText();
        scanner.scan(); // consume the HTML text token
        // Extract tag name from the HTML text
        let tagName = '';
        const match = text.match(/^<\/?([a-zA-Z][a-zA-Z0-9]*)/);
        if (match) {
            tagName = match[1];
        }
        const end = scanner.getTokenStart();
        return createHtmlElementNode(start, end, tagName, [], [], false);
    }
    // Handle opening tags
    if (scanner.getToken() === 2 /* SyntaxKind.LessThanToken */) {
        scanner.scan(); // consume '<'
        // Get tag name
        let tagName = '';
        if (scanner.getToken() === 36 /* SyntaxKind.Identifier */) {
            tagName = scanner.getTokenText();
            scanner.scan();
        }
        // Skip attributes for now (TODO: implement in phase 3)
        while (scanner.getToken() !== 4 /* SyntaxKind.GreaterThanToken */ &&
            scanner.getToken() !== 5 /* SyntaxKind.SlashGreaterThanToken */ &&
            scanner.getToken() !== 1 /* SyntaxKind.EndOfFileToken */ &&
            scanner.getToken() !== 32 /* SyntaxKind.NewLineTrivia */) {
            scanner.scan();
        }
        // Consume closing '>' or '/>'
        if (scanner.getToken() === 4 /* SyntaxKind.GreaterThanToken */ || scanner.getToken() === 5 /* SyntaxKind.SlashGreaterThanToken */) {
            scanner.scan();
        }
        const end = scanner.getTokenStart();
        return createHtmlElementNode(start, end, tagName, [], [], false);
    }
    // Handle closing tags
    if (scanner.getToken() === 3 /* SyntaxKind.LessThanSlashToken */) {
        scanner.scan(); // consume '</'
        // Get tag name
        let tagName = '';
        if (scanner.getToken() === 36 /* SyntaxKind.Identifier */) {
            tagName = scanner.getTokenText();
            scanner.scan();
        }
        // Skip to closing '>'
        while (scanner.getToken() !== 4 /* SyntaxKind.GreaterThanToken */ &&
            scanner.getToken() !== 1 /* SyntaxKind.EndOfFileToken */ &&
            scanner.getToken() !== 32 /* SyntaxKind.NewLineTrivia */) {
            scanner.scan();
        }
        // Consume '>'
        if (scanner.getToken() === 4 /* SyntaxKind.GreaterThanToken */) {
            scanner.scan();
        }
        const end = scanner.getTokenStart();
        // For now, treat closing tags as empty elements (TODO: proper HTML tree in phase 3)
        return createHtmlElementNode(start, end, tagName, [], [], false);
    }
    // Fallback: consume at least one token to avoid infinite loop
    scanner.scan();
    const end = scanner.getTokenStart();
    return createHtmlElementNode(start, end, '', [], [], false);
}
function computeLineStarts(source) {
    const lineStarts = [0];
    for (let i = 0; i < source.length; i++) {
        const ch = source.charCodeAt(i);
        if (ch === 10 || ch === 13) { // \n or \r
            if (ch === 13 && i + 1 < source.length && source.charCodeAt(i + 1) === 10) {
                i++; // Skip \r\n
            }
            lineStarts.push(i + 1);
        }
    }
    return lineStarts;
}
function addDiagnostic(context, code, category, subject, pos, end, message) {
    context.diagnostics.push({
        code,
        category,
        subject,
        pos,
        end,
        message
    });
}
