export interface Section {
  id: string;
  title: string;
  level: number;
  content: string;
  children: Section[];
}

export interface HeadingNode {
  id: string;
  title: string;
  level: number;
  children: HeadingNode[];
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export function extractSections(markdown: string): Section[] {
  const lines = markdown.split("\n");
  const sections: Section[] = [];
  let currentSection: Section | null = null;
  const contentLines: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
    }

    const headingMatch = !inCodeBlock && line.match(/^(#{1,3})\s+(.+)/);

    if (headingMatch) {
      if (currentSection) {
        currentSection.content = contentLines.join("\n").trim();
        sections.push(currentSection);
        contentLines.length = 0;
      }

      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();
      currentSection = {
        id: slugify(title),
        title,
        level,
        content: "",
        children: [],
      };
    } else if (currentSection) {
      contentLines.push(line);
    }
  }

  if (currentSection) {
    currentSection.content = contentLines.join("\n").trim();
    sections.push(currentSection);
  }

  return sections;
}

export function buildHeadingTree(sections: Section[]): HeadingNode[] {
  const root: HeadingNode[] = [];
  const stack: HeadingNode[] = [];

  for (const section of sections) {
    const node: HeadingNode = {
      id: section.id,
      title: section.title,
      level: section.level,
      children: [],
    };

    while (stack.length > 0 && stack[stack.length - 1].level >= section.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }

    stack.push(node);
  }

  return root;
}
