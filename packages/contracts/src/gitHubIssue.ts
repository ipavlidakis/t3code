import * as Schema from "effect/Schema";
import { IsoDateTime, PositiveInt, ProjectId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { PullRequestActor, PullRequestLabel, PullRequestListProjectError } from "./pullRequest.ts";

export const GitHubIssue = Schema.Struct({
  number: PositiveInt,
  title: Schema.String,
  url: TrimmedNonEmptyString,
  state: Schema.Literals(["open", "closed"]),
  author: Schema.NullOr(PullRequestActor),
  labels: Schema.Array(PullRequestLabel),
  updatedAt: IsoDateTime,
});
export type GitHubIssue = typeof GitHubIssue.Type;

export const GitHubIssueListInput = Schema.Struct({
  state: Schema.Literals(["open", "closed", "all"]),
  projectId: Schema.optional(ProjectId),
  query: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(200))),
  pages: Schema.optional(
    Schema.Record(
      TrimmedNonEmptyString,
      Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 10000 })),
    ),
  ),
});
export type GitHubIssueListInput = typeof GitHubIssueListInput.Type;

export const GitHubIssueListResult = Schema.Struct({
  entries: Schema.Array(
    Schema.Struct({
      ...GitHubIssue.fields,
      projectId: ProjectId,
      projectTitle: Schema.String,
      host: TrimmedNonEmptyString,
      repository: TrimmedNonEmptyString,
    }),
  ),
  errors: Schema.Array(PullRequestListProjectError),
  repositoryCount: Schema.Number,
  nextPages: Schema.Record(TrimmedNonEmptyString, PositiveInt),
  truncated: Schema.Boolean,
});
export type GitHubIssueListResult = typeof GitHubIssueListResult.Type;
