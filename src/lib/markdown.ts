/** 剥离 SKILL.md 顶部的 YAML frontmatter（--- ... ---）*/
export function stripFrontmatter(content: string): string {
  if (!content.trimStart().startsWith('---')) return content;
  const after = content.trimStart().slice(3);
  const endIdx = after.indexOf('\n---');
  if (endIdx === -1) return content;
  return after.slice(endIdx + 4).trimStart();
}

/** 解析 SKILL.md 顶部的 YAML frontmatter，返回 key-value 映射 */
export function parseFrontmatter(content: string): Record<string, string | string[]> {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith('---')) return {};

  const after = trimmed.slice(3);
  const endIdx = after.indexOf('\n---');
  if (endIdx === -1) return {};

  const yaml = after.slice(0, endIdx);
  const result: Record<string, string | string[]> = {};

  let i = 0;
  const lines = yaml.split('\n');

  while (i < lines.length) {
    const line = lines[i];
    // 跳过空行和纯注释行
    if (!line.trim() || line.trim().startsWith('#')) { i++; continue; }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) { i++; continue; }

    const key = line.slice(0, colonIdx).trim();
    const rest = line.slice(colonIdx + 1).trim();

    // 多行列表：下一行以 "  - " 开头
    if (rest === '' && i + 1 < lines.length && lines[i + 1].trimStart().startsWith('- ')) {
      const items: string[] = [];
      i++;
      while (i < lines.length && lines[i].trimStart().startsWith('- ')) {
        items.push(lines[i].trimStart().slice(2).trim());
        i++;
      }
      result[key] = items;
      continue;
    }

    // 行内列表：[a, b, c]
    if (rest.startsWith('[') && rest.endsWith(']')) {
      const items = rest
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
      result[key] = items.length === 1 ? items[0] : items;
      i++;
      continue;
    }

    // 普通字符串值（去除可选的引号）
    if (rest !== '') {
      result[key] = rest.replace(/^['"]|['"]$/g, '');
    }
    i++;
  }

  return result;
}
