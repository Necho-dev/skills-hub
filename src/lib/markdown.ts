/** 剥离 SKILL.md 顶部的 YAML frontmatter（--- ... ---）*/
export function stripFrontmatter(content: string): string {
  if (!content.trimStart().startsWith('---')) return content;
  const after = content.trimStart().slice(3);
  const endIdx = after.indexOf('\n---');
  if (endIdx === -1) return content;
  return after.slice(endIdx + 4).trimStart();
}
