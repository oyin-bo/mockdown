A simple named entity: a &amp; b
1                        2
@1 InlineText
@2 EntityNamed

Decimal numeric entity: 1 &#38; 2
1                         2
@1 InlineText
@2 EntityDecimal

Hex numeric entity: smile &#x1F600; end
1                         2
@1 InlineText
@2 EntityHex

Copy with no whitespace&copy;end
1                      2     3
@1 InlineText
@2 EntityNamed
@4 InlineText

Copy with whitespace &copy; end
1                   23     45
@1 InlineText
@2 Whitespace
@3 EntityNamed
@4 Whitespace
@5 InlineText
