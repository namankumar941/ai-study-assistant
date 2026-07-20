export interface GenerationPlan {
  title: string;
  summary: string;
  topics: string[];
}

export function countCompletedTopics(content: string, topics: string[]): number {
  let count = 0;
  for (const topic of topics) {
    if (content.includes(`## ${topic}`)) count++;
  }
  return count;
}
