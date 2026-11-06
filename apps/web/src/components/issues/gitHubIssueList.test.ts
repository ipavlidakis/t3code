import { describe, expect, it } from "vite-plus/test";
import type { EnvironmentId, GitHubIssueListResult, ProjectId } from "@t3tools/contracts";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { gitHubIssueTaskProjects, mergeGitHubIssuePages } from "./gitHubIssueList";

describe("mergeGitHubIssuePages", () => {
  it("deduplicates across environments and retires exhausted cursors without hiding errors", () => {
    const first: GitHubIssueListResult = {
      entries: [
        {
          number: 1,
          title: "Old title",
          url: "https://github.com/team/app/issues/1",
          state: "open",
          author: null,
          labels: [],
          updatedAt: "2026-11-05T10:00:00Z",
          host: "github.com",
          repository: "team/app",
          projectId: "p" as ProjectId,
          projectTitle: "App",
        },
      ],
      errors: [
        { projectId: "private" as ProjectId, projectTitle: "Private", message: "Access denied" },
      ],
      repositoryCount: 2,
      nextPages: { repo: 2 },
      truncated: false,
    };
    const newer = {
      ...first.entries[0]!,
      title: "New title",
      projectId: "remote-project" as ProjectId,
      updatedAt: "2026-11-06T10:00:00Z",
    };
    const result = mergeGitHubIssuePages([
      ["one" as EnvironmentId, first],
      ["two" as EnvironmentId, { ...first, entries: [newer], errors: [], nextPages: {} }],
      [
        "one" as EnvironmentId,
        {
          ...first,
          entries: [{ ...newer, number: 2 }],
          errors: [],
          nextPages: {},
          truncated: true,
        },
      ],
    ]);
    expect(result.entries.map(({ number, title }) => [number, title])).toEqual([
      [1, "New title"],
      [2, "New title"],
    ]);
    expect(result.nextPages).toEqual([]);
    expect(result.entries[0]).toMatchObject({ environmentId: "two", projectId: "remote-project" });
    expect(result.errors).toEqual(["Private: Access denied"]);
    expect(result.truncated).toBe(true);
  });

  it("offers matching remote checkouts without confusing project IDs or repository hosts", () => {
    const project: EnvironmentProject = {
      id: "project" as ProjectId,
      environmentId: "local" as EnvironmentId,
      title: "App",
      workspaceRoot: "/workspace/app",
      defaultModelSelection: null,
      scripts: [],
      createdAt: "2026-11-06T10:00:00Z",
      updatedAt: "2026-11-06T10:00:00Z",
    };
    const remote = {
      ...project,
      environmentId: "remote" as EnvironmentId,
      repositoryIdentity: {
        canonicalKey: "github.com/Team/App",
        locator: {
          source: "git-remote" as const,
          remoteName: "origin",
          remoteUrl: "git@github.com:Team/App.git",
        },
      },
    };
    const issue = {
      number: 1,
      title: "Fix the app",
      url: "https://github.com/team/app/issues/1",
      state: "open" as const,
      author: null,
      labels: [],
      updatedAt: project.updatedAt,
      host: "github.com",
      repository: "team/app",
      projectId: project.id,
      projectTitle: project.title,
      environmentId: project.environmentId,
    };
    expect(
      gitHubIssueTaskProjects(issue, [
        project,
        remote,
        { ...project, environmentId: "other" as EnvironmentId },
        { ...remote, id: "archived" as ProjectId, archivedAt: project.updatedAt },
        {
          ...remote,
          id: "enterprise" as ProjectId,
          repositoryIdentity: {
            ...remote.repositoryIdentity,
            canonicalKey: "git.example.com/team/app",
          },
        },
        {
          ...remote,
          id: "unrelated" as ProjectId,
          repositoryIdentity: {
            ...remote.repositoryIdentity,
            canonicalKey: "github.com/team/other",
          },
        },
      ]).map(({ environmentId, id }) => [environmentId, id]),
    ).toEqual([
      ["local", "project"],
      ["remote", "project"],
    ]);
  });
});
