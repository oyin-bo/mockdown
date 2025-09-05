export async function parseWithParser(name: string, content: string) {
  // Minimal scaffold: real implementations will import parser libs
  if (name === 'mixpad') {
    // pretend to parse
    return { tokenCount: content.length };
  }
  return { tokenCount: 0 };
}
