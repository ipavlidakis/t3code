import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import "~/index.css";

const mocks = vi.hoisted(() => ({ status: vi.fn(), start: vi.fn() }));

vi.mock(
  import("~/composerDraftStore"),
  () => ({ DraftId: { make: (value: string) => value } }) as never,
);
vi.mock(import("~/state/server"), () => ({ EMPTY_SERVER_PROVIDERS: [] }));
vi.mock(import("~/state/threads"), () => ({ threadEnvironment: { startTurn: {} } }) as never);
vi.mock(import("~/state/vcs"), () => ({ vcsEnvironment: { status: () => null } }) as never);
vi.mock(import("~/state/query"), () => ({ useEnvironmentQuery: mocks.status }));
vi.mock(import("~/state/use-orchestration-command"), () => ({
  useOrchestrationCommand: (() => mocks.start) as never,
}));
vi.mock(import("~/state/entities"), () => ({
  useProjects: (() =>
    ["local", "remote"].map((environmentId) => ({
      id: "app",
      environmentId,
      title: "App",
      workspaceRoot: `/${environmentId}/app`,
      repositoryIdentity: { canonicalKey: "github.com/team/app" },
    }))) as never,
}));
vi.mock(import("~/state/environments"), () => ({
  useEnvironments: (() => ({
    environments: ["local", "remote"].map((environmentId) => ({
      environmentId,
      label: environmentId,
      serverConfig: {},
    })),
  })) as never,
  useEnvironment: (() => ({ serverConfig: {} })) as never,
  useEnvironmentProviders: (() => new Map()) as never,
}));
vi.mock(import("~/state/session"), () => ({ useEnvironmentScope: () => true }));
vi.mock(import("~/hooks/useSettings"), () => ({
  useEnvironmentSettings: (() => ({ projectSettingsOverrides: {} })) as never,
  mergeEnvironmentSettings: (() => ({
    newWorktreesStartFromOrigin: true,
    defaultRuntimeMode: "full-access",
    defaultModelSelection: { provider: "codex", instanceId: "codex", model: "test" },
  })) as never,
}));
vi.mock(import("~/providerInstances"), async (importOriginal) => ({
  ...(await importOriginal()),
  providerInstanceEntriesFor: (() => [
    { instanceId: "codex", snapshot: { supportedRuntimeModes: ["full-access"] } },
  ]) as never,
  isProviderInstancePickerReady: () => true,
  resolveProjectDefaultProviderModelSelection: () => null,
}));
vi.mock(import("~/modelSelection"), () => ({
  getCustomModelOptionsByInstance: (() => new Map([["codex", [{ slug: "test" }]]])) as never,
  resolveEffectiveDefaultModelSelection: ((
    _settings: unknown,
    _providers: unknown,
    selection: unknown,
  ) => selection) as never,
}));
vi.mock(import("../chat/ProviderModelPicker"), () => ({
  ProviderModelPicker: (() => <></>) as never,
}));
vi.mock(import("../WorktreeBaseBranchPicker"), () => ({
  WorktreeBaseBranchPicker: ({ onValueChange }: { onValueChange: (branch: string) => void }) => (
    <button type="button" onClick={() => onValueChange("main")}>
      Choose main
    </button>
  ),
}));

import { render } from "../../../test/render";
import { GitHubIssueTaskDialog } from "./GitHubIssueTaskDialog";

function setup() {
  mocks.status.mockReset().mockReturnValue({ data: null, error: null, isPending: true });
  mocks.start.mockReset().mockRejectedValue(new Error("Connection interrupted"));
  return {
    issue: {
      number: 7,
      title: "Fix connection",
      url: "https://github.com/team/app/issues/7",
      state: "open" as const,
      author: null,
      labels: [],
      updatedAt: "2026-11-06T10:00:00Z",
      host: "github.com",
      repository: "team/app",
      projectId: ProjectId.make("app"),
      projectTitle: "App",
      environmentId: EnvironmentId.make("local"),
    },
    onClose: vi.fn(),
  };
}

it("waits for the destination base and preserves the remote launch request on retry", async () => {
  const props = setup();
  await using screen = await render(<GitHubIssueTaskDialog {...props} />);
  await expect
    .element(page.getByRole("button", { name: "Start task", exact: true }))
    .toBeDisabled();
  mocks.status.mockReturnValue({ data: null, error: "Git status unavailable", isPending: false });
  await screen.rerender(<GitHubIssueTaskDialog {...props} />);
  await expect
    .element(page.getByRole("alert"))
    .toHaveTextContent(
      "Could not determine the base branch: Git status unavailable. Choose a base branch to continue.",
    );
  await userEvent.click(page.getByRole("button", { name: "Choose main" }));
  await expect.element(page.getByRole("button", { name: "Start task", exact: true })).toBeEnabled();
  await userEvent.click(page.getByRole("combobox", { name: "Run on" }));
  await userEvent.click(page.getByRole("option", { name: /remote/ }));
  await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Start task", exact: true }))
    .toBeDisabled();
  mocks.status.mockReturnValue({ data: { refName: "remote-main" }, error: null, isPending: false });
  await screen.rerender(<GitHubIssueTaskDialog {...props} />);
  await userEvent.click(page.getByRole("button", { name: "Start task", exact: true }));
  await expect.element(page.getByRole("button", { name: "Retry task" })).toBeEnabled();
  await userEvent.click(page.getByRole("button", { name: "Retry task" }));
  await expect.element(page.getByRole("button", { name: "Retry task" })).toBeEnabled();
  expect(mocks.start).toHaveBeenCalledTimes(2);
  expect(mocks.start.mock.calls[1]?.[0]).toBe(mocks.start.mock.calls[0]?.[0]);
  expect(mocks.start.mock.calls[0]?.[0]).toMatchObject({
    environmentId: "remote",
    input: {
      interactionMode: "default",
      message: { text: expect.stringContaining(props.issue.url) },
      bootstrap: {
        createThread: { projectId: "app" },
        prepareWorktree: {
          projectCwd: "/remote/app",
          baseBranch: "remote-main",
          startFromOrigin: true,
        },
      },
    },
  });
});
