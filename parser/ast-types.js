/**
 * AST Node Types for Markdown Parser
 * Unified node hierarchy with consistent pos/end positioning
 */
export var NodeKind;
(function (NodeKind) {
    NodeKind[NodeKind["Document"] = 0] = "Document";
    NodeKind[NodeKind["Paragraph"] = 1] = "Paragraph";
    NodeKind[NodeKind["Heading"] = 2] = "Heading";
    NodeKind[NodeKind["Blockquote"] = 3] = "Blockquote";
    NodeKind[NodeKind["List"] = 4] = "List";
    NodeKind[NodeKind["ListItem"] = 5] = "ListItem";
    NodeKind[NodeKind["CodeBlock"] = 6] = "CodeBlock";
    NodeKind[NodeKind["ThematicBreak"] = 7] = "ThematicBreak";
    NodeKind[NodeKind["HtmlElement"] = 8] = "HtmlElement";
    NodeKind[NodeKind["HtmlComment"] = 9] = "HtmlComment";
    NodeKind[NodeKind["Table"] = 10] = "Table";
    NodeKind[NodeKind["MathBlock"] = 11] = "MathBlock";
    NodeKind[NodeKind["Text"] = 12] = "Text";
    NodeKind[NodeKind["Emphasis"] = 13] = "Emphasis";
    NodeKind[NodeKind["Strong"] = 14] = "Strong";
    NodeKind[NodeKind["InlineCode"] = 15] = "InlineCode";
    NodeKind[NodeKind["Link"] = 16] = "Link";
    NodeKind[NodeKind["Image"] = 17] = "Image";
    NodeKind[NodeKind["MathInline"] = 18] = "MathInline";
    NodeKind[NodeKind["Break"] = 19] = "Break";
    NodeKind[NodeKind["WhitespaceSeparation"] = 20] = "WhitespaceSeparation";
})(NodeKind || (NodeKind = {}));
export var NodeFlags;
(function (NodeFlags) {
    NodeFlags[NodeFlags["None"] = 0] = "None";
    NodeFlags[NodeFlags["ContainsError"] = 1] = "ContainsError";
    NodeFlags[NodeFlags["Synthetic"] = 2] = "Synthetic";
    NodeFlags[NodeFlags["Missing"] = 4] = "Missing";
    NodeFlags[NodeFlags["SelfClosing"] = 8] = "SelfClosing";
})(NodeFlags || (NodeFlags = {}));
export function getNodeKind(node) {
    return node.kindFlags & 0xFF;
}
export function getNodeFlags(node) {
    return (node.kindFlags >> 8) & 0xFFFFFF;
}
export function setNodeFlags(node, flags) {
    node.kindFlags = (node.kindFlags & 0xFF) | (flags << 8);
}
export function addNodeFlag(node, flag) {
    const currentFlags = getNodeFlags(node);
    setNodeFlags(node, currentFlags | flag);
}
export var QuoteKind;
(function (QuoteKind) {
    QuoteKind[QuoteKind["None"] = 0] = "None";
    QuoteKind[QuoteKind["Single"] = 1] = "Single";
    QuoteKind[QuoteKind["Double"] = 2] = "Double";
})(QuoteKind || (QuoteKind = {}));
