import {
  EnvironmentId,
  ProjectId,
  type GitHubIssueListInput,
  type GitHubIssueListResult,
} from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

vi.mock(import("./GitHubIssueTaskDialog"), () => ({ GitHubIssueTaskDialog: () => <></> }));

vi.mock(import("../../state/environments"), () => ({
  useEnvironments: (() => ({
    environments: [
      { environmentId: "local", label: "Local", serverConfig: {} },
      { environmentId: "remote", label: "Remote", serverConfig: {} },
    ],
  })) as never,
}));
vi.mock(import("../../state/entities"), () => ({ useProjects: (() => []) as never }));
vi.mock(import("../../state/pullRequests"), () => ({
  useGitHubIssueLists: (
    targets: ReadonlyArray<{ environmentId: EnvironmentId; input: GitHubIssueListInput }>,
  ) => ({
    isPending: false,
    error: "Remote environment unavailable",
    refresh: () => undefined,
    values: targets.map(
      ({ environmentId, input }): readonly [EnvironmentId, GitHubIssueListResult] => [
        environmentId,
        {
          entries:
            environmentId === "remote"
              ? []
              : [
                  {
                    number: input.pages ? 2 : 1,
                    title: input.query
                      ? `Found ${input.query}`
                      : input.pages
                        ? "Older issue"
                        : "Latest issue",
                    url: `https://github.com/team/app/issues/${input.pages ? 2 : 1}`,
                    state: "open",
                    author: null,
                    labels: [],
                    updatedAt: "2026-11-06T10:00:00Z",
                    host: "github.com",
                    repository: "team/app",
                    projectId: ProjectId.make("app"),
                    projectTitle: "App",
                  },
                ],
          errors: [],
          nextPages: environmentId === "remote" || input.pages || input.query ? {} : { repo: 2 },
          repositoryCount: 1,
          truncated: false,
        },
      ],
    ),
  }),
}));

import { render } from "../../../test/render";
import { GitHubIssuesPage } from "./GitHubIssuesPage";

it("keeps reachable issues visible and resets loaded pages when searching", async () => {
  await using screen = await render(<GitHubIssuesPage />);
  await expect.element(screen.getByRole("link", { name: /Latest issue/ })).toBeVisible();
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("Remote environment unavailable");
  await expect.element(screen.getByRole("button", { name: "Load more issues" })).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: "Load more issues" }));
  await expect.element(screen.getByRole("link", { name: /Older issue/ })).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Load more issues" }))
    .not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await expect.element(screen.getByRole("link", { name: /Older issue/ })).not.toBeInTheDocument();
  await expect.element(screen.getByRole("button", { name: "Load more issues" })).toBeEnabled();
  await userEvent.type(screen.getByRole("searchbox"), "connection");
  await userEvent.click(screen.getByRole("button", { name: "Search", exact: true }));
  await expect
    .element(screen.getByRole("link", { name: /Found connection/ }))
    .toHaveAttribute("href", "https://github.com/team/app/issues/1");
  await expect.element(screen.getByRole("link", { name: /Older issue/ })).not.toBeInTheDocument();
  await expect.element(screen.getByRole("link", { name: /Latest issue/ })).not.toBeInTheDocument();
});
