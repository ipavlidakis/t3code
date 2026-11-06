import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  AuthOrchestrationOperateScope,
  CommandId,
  clampManagedRuntimeMode,
  managedRuntimeModeDenial,
  type ModelSelection,
  type RuntimeMode,
} from "@t3tools/contracts";
import { sanitizeBranchFragment } from "@t3tools/shared/git";
import { createModelSelection } from "@t3tools/shared/model";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { useNavigate } from "@tanstack/react-router";
import * as DateTime from "effect/DateTime";
import { useRef, useState } from "react";

import { mergeEnvironmentSettings, useEnvironmentSettings } from "~/hooks/useSettings";
import { newMessageId, newThreadId, randomUUID } from "~/lib/utils";
import {
  getCustomModelOptionsByInstance,
  resolveEffectiveDefaultModelSelection,
} from "~/modelSelection";
import {
  isProviderInstancePickerReady,
  NO_PROVIDER_MODEL_SELECTION,
  providerInstanceEntriesFor,
  resolveProjectDefaultProviderModelSelection,
} from "~/providerInstances";
import { useProjects } from "~/state/entities";
import { useEnvironment, useEnvironmentProviders, useEnvironments } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { EMPTY_SERVER_PROVIDERS } from "~/state/server";
import { useEnvironmentScope } from "~/state/session";
import { threadEnvironment } from "~/state/threads";
import { useOrchestrationCommand } from "~/state/use-orchestration-command";
import { vcsEnvironment } from "~/state/vcs";
import { buildThreadRouteParams } from "~/threadRoutes";
import { WorktreeBaseBranchPicker } from "../WorktreeBaseBranchPicker";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import {
  resolveCompatibleRuntimeMode,
  resolveRuntimeModeOptions,
  runtimeModeConfig,
} from "../chat/runtimeModeConfig";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { gitHubIssueTaskProjects, type EnvironmentGitHubIssue } from "./gitHubIssueList";

export function GitHubIssueTaskDialog({
  issue,
  onClose,
}: {
  issue: EnvironmentGitHubIssue;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const projects = useProjects();
  const { environments } = useEnvironments();
  const [destination, setDestination] = useState({
    environmentId: issue.environmentId,
    projectId: issue.projectId,
  });
  const destinations = gitHubIssueTaskProjects(issue, projects);
  const destinationOptions = destinations.map((candidate) => ({
    value: JSON.stringify([candidate.environmentId, candidate.id]),
    label: `${environments.find((entry) => entry.environmentId === candidate.environmentId)?.label ?? candidate.environmentId} · ${candidate.title} · ${candidate.workspaceRoot}`,
    project: candidate,
    connected: environments.some(
      (entry) => entry.environmentId === candidate.environmentId && entry.serverConfig,
    ),
  }));
  const project = destinations.find(
    (candidate) =>
      candidate.id === destination.projectId &&
      candidate.environmentId === destination.environmentId,
  );
  const environment = useEnvironment(destination.environmentId);
  const environmentSettings = useEnvironmentSettings(destination.environmentId);
  const settings = mergeEnvironmentSettings(
    resolveProjectSettings(environmentSettings, destination.projectId, project).settings,
    environmentSettings,
  );
  const providers =
    useEnvironmentProviders().get(destination.environmentId) ?? EMPTY_SERVER_PROVIDERS;
  const entries = providerInstanceEntriesFor(providers, settings, destination.projectId);
  const defaultSelection =
    settings.defaultModelSelection ??
    resolveProjectDefaultProviderModelSelection(providers, settings, destination.projectId);
  const [chosenModel, setChosenModel] = useState<ModelSelection | null>(null);
  const modelSelection =
    chosenModel ??
    (defaultSelection
      ? resolveEffectiveDefaultModelSelection(settings, providers, defaultSelection)
      : null);
  const activeEntry = entries.find((entry) => entry.instanceId === modelSelection?.instanceId);
  const modelOptions = getCustomModelOptionsByInstance(
    settings,
    providers,
    modelSelection?.instanceId,
    modelSelection?.model,
  );
  const [title, setTitle] = useState(`#${issue.number}: ${issue.title}`.slice(0, 200));
  const [prompt, setPrompt] = useState(`Work on this GitHub issue:\n${issue.url}`);
  const [workspace, setWorkspace] = useState<"worktree" | "root">("worktree");
  const [branch, setBranch] = useState(
    `issue-${issue.number}-${sanitizeBranchFragment(issue.title)}`,
  );
  const [baseBranch, setBaseBranch] = useState<string | null>(null);
  const [originOverride, setStartFromOrigin] = useState<boolean | null>(null);
  const startFromOrigin = originOverride ?? settings.newWorktreesStartFromOrigin;
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const [threadId] = useState(newThreadId);
  const [messageId] = useState(newMessageId);
  const [launched, setLaunched] = useState(false);
  const startTurn = useOrchestrationCommand(threadEnvironment.startTurn, { reportFailure: false });
  const [launchRequest, setLaunchRequest] = useState<Parameters<typeof startTurn>[0] | null>(null);
  const canOperate = useEnvironmentScope(destination.environmentId, AuthOrchestrationOperateScope);
  const status = useEnvironmentQuery(
    project && workspace === "worktree"
      ? vcsEnvironment.status({
          environmentId: destination.environmentId,
          input: { cwd: project.workspaceRoot },
        })
      : null,
  );
  const resolvedBaseBranch = baseBranch ?? status.data?.refName ?? "HEAD";
  const baseUnavailable =
    workspace === "root" || baseBranch !== null || launchRequest !== null
      ? null
      : status.error
        ? `Could not determine the base branch: ${status.error}. Choose a base branch to continue.`
        : status.isPending || !status.data
          ? "Loading the destination's base branch…"
          : startFromOrigin && !status.data.refName
            ? "Choose a base branch to start from origin."
            : null;
  const managedPolicy = environment?.serverConfig?.managedPolicy;
  const compatible = resolveCompatibleRuntimeMode(
    runtimeMode ?? settings.defaultRuntimeMode,
    activeEntry?.snapshot.supportedRuntimeModes,
  );
  const effectiveRuntimeMode =
    clampManagedRuntimeMode(managedPolicy, compatible.mode, compatible.modes) ?? compatible.mode;
  const modes = resolveRuntimeModeOptions(compatible.modes, managedPolicy);
  const unavailable = !project
    ? "Choose an available project for this repository."
    : !environment?.serverConfig
      ? "Connect to the selected environment to start a task."
      : !canOperate
        ? "This connection cannot start threads."
        : !activeEntry || !isProviderInstancePickerReady(activeEntry)
          ? "Choose an available agent."
          : !modelSelection?.model ||
              !modelOptions
                .get(modelSelection.instanceId)
                ?.some((model) => model.slug === modelSelection.model && !model.isUnavailable)
            ? "Choose an available model."
            : (baseUnavailable ?? managedRuntimeModeDenial(managedPolicy, effectiveRuntimeMode));

  const submit = async () => {
    if (submitting.current || (!launched && (unavailable || !project || !modelSelection))) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    let hasLaunched = launched;
    try {
      if (!launched && project && modelSelection) {
        const createdAt = DateTime.formatIso(DateTime.nowUnsafe());
        const request = launchRequest ?? {
          environmentId: destination.environmentId,
          input: {
            commandId: CommandId.make(randomUUID()),
            threadId,
            message: {
              messageId,
              role: "user" as const,
              attachments: [],
              text: prompt.includes(issue.url)
                ? prompt.trim()
                : `${prompt.trim()}\n\nGitHub issue: ${issue.url}`,
            },
            modelSelection,
            runtimeMode: effectiveRuntimeMode,
            interactionMode: "default" as const,
            bootstrap: {
              createThread: {
                projectId: project.id,
                title: title.trim(),
                modelSelection,
                runtimeMode: effectiveRuntimeMode,
                interactionMode: "default" as const,
                branch: null,
                worktreePath: null,
                createdAt,
              },
              ...(workspace === "worktree"
                ? {
                    prepareWorktree: {
                      projectCwd: project.workspaceRoot,
                      baseBranch: resolvedBaseBranch,
                      branch: branch.trim(),
                      startFromOrigin,
                    },
                  }
                : {}),
            },
            createdAt,
          },
        };
        setLaunchRequest(request);
        const result = await startTurn(request);
        if (result._tag === "Failure") {
          const failure = squashAtomCommandFailure(result);
          setError(failure instanceof Error ? failure.message : String(failure));
        } else {
          setLaunched(true);
          hasLaunched = true;
        }
      }
      if (hasLaunched) {
        await navigate({
          to: "/$environmentId/$threadId",
          params: buildThreadRouteParams(scopeThreadRef(destination.environmentId, threadId)),
        });
        onClose();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
    submitting.current = false;
    setPending(false);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !submitting.current) onClose();
      }}
    >
      <DialogPopup showCloseButton={!pending}>
        <form
          className="flex min-h-0 min-w-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>Start task from issue</DialogTitle>
            <DialogDescription>
              {project?.title ?? issue.projectTitle} ·{" "}
              {environment?.label ?? destination.environmentId}
            </DialogDescription>
            <a
              className="break-words text-sm text-primary underline"
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {issue.repository} #{issue.number}
            </a>
          </DialogHeader>
          <DialogPanel>
            <fieldset disabled={pending || launchRequest !== null} className="min-w-0 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="issue-task-destination" className="text-sm font-medium">
                  Run on
                </label>
                <Select
                  value={JSON.stringify([destination.environmentId, destination.projectId])}
                  items={destinationOptions}
                  onValueChange={(value) => {
                    const selected = destinationOptions.find((option) => option.value === value);
                    if (!selected || !selected.connected || submitting.current || launchRequest)
                      return;
                    setDestination({
                      environmentId: selected.project.environmentId,
                      projectId: selected.project.id,
                    });
                    setChosenModel(null);
                    setBaseBranch(null);
                    setStartFromOrigin(null);
                    setRuntimeMode(null);
                    setError(null);
                  }}
                >
                  <SelectTrigger
                    id="issue-task-destination"
                    disabled={pending || launchRequest !== null}
                  >
                    <SelectValue placeholder="Choose an environment and project" />
                  </SelectTrigger>
                  <SelectPopup>
                    {destinationOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        disabled={!option.connected}
                      >
                        <span className="block max-w-[min(26rem,calc(100vw-4rem))] wrap-anywhere">
                          {option.label}
                          {option.connected ? "" : " (disconnected)"}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Connect a remote environment and add this repository there to run on another
                  machine.
                </p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="issue-task-title" className="text-sm font-medium">
                  Thread title
                </label>
                <Input
                  id="issue-task-title"
                  required
                  maxLength={200}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Agent and model</p>
                <ProviderModelPicker
                  environmentId={destination.environmentId}
                  activeInstanceId={(modelSelection ?? NO_PROVIDER_MODEL_SELECTION).instanceId}
                  model={modelSelection?.model ?? ""}
                  lockedProvider={null}
                  instanceEntries={entries}
                  modelOptionsByInstance={modelOptions}
                  disabled={pending || launchRequest !== null}
                  triggerAriaLabel="Task agent and model"
                  onInstanceModelChange={(instanceId, model) =>
                    setChosenModel(createModelSelection(instanceId, model))
                  }
                />
              </div>
              <div className="flex flex-wrap gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="issue-task-workspace" className="text-sm font-medium">
                    Workspace
                  </label>
                  <Select
                    value={workspace}
                    onValueChange={(value) => {
                      if (value) setWorkspace(value);
                    }}
                    items={{ worktree: "New worktree", root: "Project checkout" }}
                  >
                    <SelectTrigger id="issue-task-workspace">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup>
                      <SelectItem value="worktree">New worktree</SelectItem>
                      <SelectItem value="root">Project checkout</SelectItem>
                    </SelectPopup>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="issue-task-permissions" className="text-sm font-medium">
                    Permissions
                  </label>
                  <Select
                    value={effectiveRuntimeMode}
                    onValueChange={(value) => {
                      if (value) setRuntimeMode(value);
                    }}
                  >
                    <SelectTrigger id="issue-task-permissions">
                      <SelectValue>{runtimeModeConfig[effectiveRuntimeMode].label}</SelectValue>
                    </SelectTrigger>
                    <SelectPopup>
                      {modes.map((option) => (
                        <SelectItem
                          key={option.mode}
                          value={option.mode}
                          disabled={"disabledReason" in option}
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </div>
              </div>
              {workspace === "worktree" ? (
                <>
                  <div className="space-y-1.5">
                    <label htmlFor="issue-task-branch" className="text-sm font-medium">
                      Worktree branch
                    </label>
                    <Input
                      id="issue-task-branch"
                      required
                      value={branch}
                      onChange={(event) => setBranch(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      T3 creates the worktree directory and runs the project's setup scripts.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="issue-task-base" className="text-sm font-medium">
                      Base branch
                    </label>
                    <WorktreeBaseBranchPicker
                      id="issue-task-base"
                      environmentId={destination.environmentId}
                      cwd={project?.workspaceRoot ?? null}
                      value={resolvedBaseBranch}
                      onValueChange={setBaseBranch}
                      startFromOrigin={startFromOrigin}
                      onStartFromOriginChange={setStartFromOrigin}
                      disabled={pending || launchRequest !== null || !project}
                    />
                  </div>
                </>
              ) : null}
              <div className="space-y-1.5">
                <label htmlFor="issue-task-prompt" className="text-sm font-medium">
                  Prompt
                </label>
                <Textarea
                  id="issue-task-prompt"
                  required
                  rows={4}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  The issue URL is always included with your instructions.
                </p>
              </div>
            </fieldset>
            {unavailable || error ? (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {error ?? unavailable}
              </p>
            ) : null}
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                pending ||
                (!launched &&
                  (!!unavailable ||
                    !title.trim() ||
                    !prompt.trim() ||
                    (workspace === "worktree" && !branch.trim())))
              }
            >
              {pending
                ? "Starting task…"
                : launched
                  ? "Open thread"
                  : launchRequest
                    ? "Retry task"
                    : "Start task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
