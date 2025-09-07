// Helpers for inline fragment accumulation, merging and a simple delimiter resolver.
// Implements a small, focused API following the "accumulation model" described
// in the parser design notes: fragments are small ephemeral objects that carry
// primitive metadata and optional references to scanner-provided normalized text.

export enum FragmentKind {
  Text = 'Text',
  Delimiter = 'Delimiter',
  Composite = 'Composite'
}

export type TextPiece = string;

export interface FragmentBase {
  kind: FragmentKind;
  start: number;
  end: number;
}

export interface TextFragment extends FragmentBase {
  kind: FragmentKind.Text;
  // references to scanner-normalized text pieces (do not copy per-token strings)
  pieces: TextPiece[];
}

export interface DelimiterFragment extends FragmentBase {
  kind: FragmentKind.Delimiter;
  char: string; // '*' or '_', etc.
  length: number; // run length (1 for '*', 2 for '**', ...)
}

export interface CompositeFragment extends FragmentBase {
  kind: FragmentKind.Composite;
  // flattened text pieces for the composite (finalized on creation)
  pieces: TextPiece[];
  // children fragments that formed this composite (kept for diagnostics / inspection)
  children: Fragment[];
}

export type Fragment = TextFragment | DelimiterFragment | CompositeFragment;

export function createTextFragment(start: number, end: number, text: string): TextFragment {
  return { kind: FragmentKind.Text, start, end, pieces: [text] };
}

export function createDelimiterFragment(start: number, end: number, char: string, length: number): DelimiterFragment {
  return { kind: FragmentKind.Delimiter, start, end, char, length };
}

// Merge contiguous text fragments by extending offsets and concatenating pieces array only when finalizing.
export function mergeContiguousTextFragments(fragments: Fragment[]): Fragment[] {
  const out: Fragment[] = [];
  for (const f of fragments) {
    if (f.kind === FragmentKind.Text && out.length > 0 && out[out.length - 1].kind === FragmentKind.Text) {
      const prev = out[out.length - 1] as TextFragment;
      if (prev.end === f.start) {
        // extend previous text fragment
        prev.end = f.end;
        prev.pieces.push(...(f as TextFragment).pieces);
        continue;
      }
    }
    out.push(cloneFragmentShallow(f));
  }
  return out;
}

function cloneFragmentShallow(f: Fragment): Fragment {
  if (f.kind === FragmentKind.Text) return { kind: f.kind, start: f.start, end: f.end, pieces: [...f.pieces] };
  if (f.kind === FragmentKind.Delimiter) return { kind: f.kind, start: f.start, end: f.end, char: f.char, length: f.length };
  return { kind: f.kind, start: f.start, end: f.end, pieces: [...f.pieces], children: [...f.children] };
}

// Finalize a TextFragment into a single string. Prefer single allocation when possible.
export function finalizeInlineText(fragment: TextFragment): string {
  const pieces = fragment.pieces;
  return pieces.length === 1 ? pieces[0] : pieces.join('');
}

// A simple, predictable delimiter resolver. It pairs delimiter fragments left-to-right
// with the next delimiter of the same char. This intentionally implements a conservative
// matching strategy (no nested/priority rules) and returns a new fragments array where
// matched runs are replaced by a CompositeFragment containing the final pieces.
export function resolveDelimiters(fragments: Fragment[]): Fragment[] {
  const out: Fragment[] = [];
  let i = 0;
  while (i < fragments.length) {
    const f = fragments[i];
    if (f.kind === FragmentKind.Delimiter) {
      // search forward for a matching delimiter with same char
      let j = i + 1;
      let found = -1;
      while (j < fragments.length) {
        const cand = fragments[j];
        if (cand.kind === FragmentKind.Delimiter && cand.char === f.char) {
          found = j;
          break;
        }
        j++;
      }
      if (found !== -1) {
        // build composite from fragments between i and found
        const start = f.start;
        const end = fragments[found].end;
        const children: Fragment[] = [];
        const pieces: TextPiece[] = [];
        for (let k = i + 1; k < found; k++) {
          const child = fragments[k];
          children.push(child);
          if (child.kind === FragmentKind.Text) pieces.push(...child.pieces);
          else if (child.kind === FragmentKind.Composite) pieces.push(...child.pieces);
          // ignore delimiter fragments inside the span for text materialization
        }
        const composite: CompositeFragment = { kind: FragmentKind.Composite, start, end, pieces, children };
        // append composite to output
        out.push(composite);
        i = found + 1;
        continue;
      }
    }
    // default: push a shallow clone of the fragment
    out.push(cloneFragmentShallow(f));
    i++;
  }
  return out;
}

// Utility: collect final string representation for a sequence of fragments.
export function materializeFragments(fragments: Fragment[]): string {
  const parts: string[] = [];
  for (const f of fragments) {
    if (f.kind === FragmentKind.Text) parts.push(finalizeInlineText(f));
    else if (f.kind === FragmentKind.Composite) parts.push(f.pieces.length === 1 ? f.pieces[0] : f.pieces.join(''));
    else if (f.kind === FragmentKind.Delimiter) {
      // delimiters are treated as raw text when not matched
      parts.push(f.char.repeat(f.length));
    }
  }
  return parts.length === 1 ? parts[0] : parts.join('');
}

export default {
  FragmentKind,
  createTextFragment,
  createDelimiterFragment,
  mergeContiguousTextFragments,
  finalizeInlineText,
  resolveDelimiters,
  materializeFragments
};
