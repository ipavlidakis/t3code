import type { EnvironmentId, GitHubIssueListResult } from "@t3tools/contracts";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";

export type EnvironmentGitHubIssue = GitHubIssueListResult["entries"][number] & {
  readonly environmentId: EnvironmentId;
};

export function gitHubIssueTaskProjects(
  issue: EnvironmentGitHubIssue,
  projects: ReadonlyArray<EnvironmentProject>,
) {
  const repositoryKey = `${issue.host}/${issue.repository}`.toLowerCase();
  return projects.filter(
    (project) =>
      !project.archivedAt &&
      ((project.id === issue.projectId && project.environmentId === issue.environmentId) ||
        project.repositoryIdentity?.canonicalKey.toLowerCase() === repositoryKey),
  );
}

export function mergeGitHubIssuePages(
  pages: ReadonlyArray<readonly [EnvironmentId, GitHubIssueListResult]>,
) {
  const entries = new Map<string, EnvironmentGitHubIssue>();
  const nextPages = new Map<EnvironmentId, GitHubIssueListResult["nextPages"]>();
  const errors = new Map<string, string>();
  let truncated = false;
  for (const [environmentId, page] of pages) {
    nextPages.set(environmentId, page.nextPages);
    truncated ||= page.truncated;
    for (const issue of page.entries) {
      const key = `${issue.host}/${issue.repository}/${issue.number}`.toLowerCase();
      const existing = entries.get(key);
      if (existing === undefined || issue.updatedAt > existing.updatedAt) {
        entries.set(key, { ...issue, environmentId });
      }
    }
    for (const error of page.errors) {
      errors.set(`${environmentId}/${error.projectId}`, `${error.projectTitle}: ${error.message}`);
    }
  }
  return {
    entries: [...entries.values()].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    ),
    nextPages: [...nextPages].filter(([, cursors]) => Object.keys(cursors).length > 0),
    errors: [...errors.values()],
    truncated,
  };
}
