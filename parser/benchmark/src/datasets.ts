export function getDataset(name: string): { name: string; content: string } {
  if (name === 'small-simple') return { name, content: '# Hi\n\nThis is a small document.' };
  return { name, content: '' };
}
