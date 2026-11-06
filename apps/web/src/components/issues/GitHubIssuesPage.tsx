import type { GitHubIssueListInput } from "@t3tools/contracts";
import { CheckCircle2Icon, CircleDotIcon, PlayIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";

import { isElectron } from "~/env";
import { workspaceAreaProps } from "~/lib/workspaceFocus";
import { useProjects } from "~/state/entities";
import { useEnvironments } from "~/state/environments";
import { type EnvironmentQueryTarget, useGitHubIssueLists } from "~/state/pullRequests";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SidebarInset } from "../ui/sidebar";
import { type EnvironmentGitHubIssue, mergeGitHubIssuePages } from "./gitHubIssueList";
import { GitHubIssueTaskDialog } from "./GitHubIssueTaskDialog";

export function GitHubIssuesPage() {
  const { environments } = useEnvironments();
  const projects = useProjects();
  const [state, setState] = useState<GitHubIssueListInput["state"]>("open");
  const [repository, setRepository] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const connected = environments
    .filter((environment) => environment.serverConfig !== null)
    .sort((left, right) => left.environmentId.localeCompare(right.environmentId));
  const repositories = projects.filter(
    (project) =>
      !project.isScratch &&
      project.repositoryIdentity?.provider === "github" &&
      connected.some((environment) => environment.environmentId === project.environmentId),
  );
  const selected = repositories.find(
    (project) => `${project.environmentId}/${project.id}` === repository,
  );
  const targets = connected
    .filter(
      (environment) =>
        selected === undefined || selected.environmentId === environment.environmentId,
    )
    .map(({ environmentId }) => ({
      environmentId,
      input: {
        state,
        ...(query ? { query } : {}),
        ...(selected ? { projectId: selected.id } : {}),
      },
    }));

  return (
    <SidebarInset>
      <div
        {...workspaceAreaProps("github-issues", 1, "GitHub issues")}
        className="flex min-h-0 flex-1 flex-col"
      >
        <WorkspacePageHeader electron={isElectron}>
          <h1 className="text-sm font-medium">GitHub issues</h1>
        </WorkspacePageHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <WorkspacePageContainer width="expanded">
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                setQuery(search.trim());
              }}
            >
              <div className="min-w-48 flex-1">
                <Input
                  type="search"
                  aria-label="Search issue titles"
                  placeholder="Search issue titles…"
                  maxLength={200}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <Button type="submit" variant="outline">
                Search
              </Button>
              <Select
                value={state}
                onValueChange={(value) => {
                  if (value) setState(value);
                }}
                items={{ open: "Open", closed: "Closed", all: "All states" }}
              >
                <SelectTrigger aria-label="Issue state">
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="all">All states</SelectItem>
                </SelectPopup>
              </Select>
              <div className="max-w-full sm:max-w-80">
                <Select value={repository} onValueChange={(value) => setRepository(value ?? "")}>
                  <SelectTrigger aria-label="Repository">
                    <SelectValue>
                      {selected?.repositoryIdentity?.displayName ?? "All repositories"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="">All repositories</SelectItem>
                    {repositories.map((project) => (
                      <SelectItem
                        key={`${project.environmentId}/${project.id}`}
                        value={`${project.environmentId}/${project.id}`}
                      >
                        {project.repositoryIdentity?.displayName} ·{" "}
                        {
                          environments.find(
                            (environment) => environment.environmentId === project.environmentId,
                          )?.label
                        }{" "}
                        / {project.title}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </div>
            </form>
            {connected.length < environments.length ? (
              <p role="status" className="text-sm text-muted-foreground">
                Some environments are unavailable. Showing issues from reachable environments.
              </p>
            ) : null}
            <GitHubIssueResults key={JSON.stringify(targets)} targets={targets} />
          </WorkspacePageContainer>
        </div>
      </div>
    </SidebarInset>
  );
}

function GitHubIssueResults({
  targets,
}: {
  readonly targets: ReadonlyArray<EnvironmentQueryTarget<GitHubIssueListInput>>;
}) {
  const [taskIssue, setTaskIssue] = useState<EnvironmentGitHubIssue | null>(null);
  const [additionalPages, setAdditionalPages] = useState<
    ReadonlyArray<EnvironmentQueryTarget<GitHubIssueListInput>>
  >([]);
  const result = useGitHubIssueLists([...targets, ...additionalPages]);
  const merged = mergeGitHubIssuePages(result.values);

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p role="status" className="text-sm text-muted-foreground">
          {result.isPending ? "Loading issues…" : `${merged.entries.length} issues`}
        </p>
        <Button
          variant="ghost"
          size="sm"
          disabled={result.isPending || targets.length === 0}
          onClick={() => {
            setAdditionalPages([]);
            result.refresh(targets);
          }}
        >
          <RefreshCwIcon />
          Refresh
        </Button>
      </div>
      {result.error ? (
        <p role="alert" className="text-sm text-destructive">
          {result.error}
        </p>
      ) : null}
      {merged.errors.map((error) => (
        <p key={error} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ))}
      {merged.truncated ? (
        <p role="status" className="text-sm text-muted-foreground">
          GitHub limited these search results. Narrow your search or choose a repository.
        </p>
      ) : null}
      {!result.isPending && merged.entries.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {targets.length === 0
            ? "Connect an environment to see GitHub issues."
            : result.error || merged.errors.length
              ? "Some issues could not be loaded. Refresh to retry."
              : "No matching issues. Issues are read from the GitHub repositories connected to your projects."}
        </div>
      ) : null}
      <ul className="divide-y divide-border">
        {merged.entries.map((issue) => (
          <li
            key={`${issue.host}/${issue.repository}/${issue.number}`}
            className="flex flex-wrap items-center gap-2"
          >
            <a
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-w-0 flex-1 items-start gap-3 rounded-lg px-3 py-4 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            >
              {issue.state === "open" ? (
                <CircleDotIcon aria-label="Open" className="mt-0.5 size-4 shrink-0 text-success" />
              ) : (
                <CheckCircle2Icon
                  aria-label="Closed"
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
              )}
              <div className="min-w-0 flex-1">
                <span className="block break-words text-sm font-medium">{issue.title}</span>
                <span className="mt-1 block break-words text-xs text-muted-foreground">
                  {issue.host !== "github.com" ? `${issue.host}/` : ""}
                  {issue.repository} #{issue.number}
                  {issue.author ? ` · ${issue.author.login}` : ""}
                </span>
                {issue.labels.length ? (
                  <span className="mt-2 flex flex-wrap gap-1">
                    {issue.labels.map((label) => (
                      <span
                        key={label.name}
                        className="rounded-md bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
                      >
                        {label.name}
                      </span>
                    ))}
                  </span>
                ) : null}
              </div>
              <time
                dateTime={issue.updatedAt}
                aria-label={`Updated ${new Date(issue.updatedAt).toLocaleString()}`}
                className="shrink-0 text-xs text-muted-foreground"
              >
                {new Date(issue.updatedAt).toLocaleDateString()}
              </time>
            </a>
            <Button
              variant="outline"
              size="sm"
              aria-label={`Start task for issue #${issue.number}: ${issue.title}`}
              onClick={() => setTaskIssue(issue)}
            >
              <PlayIcon />
              Start task
            </Button>
          </li>
        ))}
      </ul>
      {taskIssue ? (
        <GitHubIssueTaskDialog issue={taskIssue} onClose={() => setTaskIssue(null)} />
      ) : null}
      {merged.nextPages.length > 0 ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            disabled={result.isPending}
            onClick={() => {
              setAdditionalPages((previous) => [
                ...previous,
                ...merged.nextPages.flatMap(([environmentId, pages]) => {
                  const target = targets.find(
                    (candidate) => candidate.environmentId === environmentId,
                  );
                  return target ? [{ environmentId, input: { ...target.input, pages } }] : [];
                }),
              ]);
            }}
          >
            Load more issues
          </Button>
        </div>
      ) : null}
    </>
  );
}
