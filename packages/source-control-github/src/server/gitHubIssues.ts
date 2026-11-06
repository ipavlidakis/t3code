import * as Schema from "effect/Schema";
import { IsoDateTime, PositiveInt, type GitHubIssue } from "@t3tools/contracts";

const Issue = Schema.Struct({
  number: PositiveInt,
  title: Schema.String,
  html_url: Schema.String,
  state: Schema.Literals(["open", "closed"]),
  user: Schema.NullOr(
    Schema.Struct({ login: Schema.String, avatar_url: Schema.NullOr(Schema.String) }),
  ),
  labels: Schema.Array(Schema.Struct({ name: Schema.String, color: Schema.NullOr(Schema.String) })),
  updated_at: IsoDateTime,
  pull_request: Schema.optional(Schema.Unknown),
});

export const decodeIssuePage = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Array(Issue)),
);
export const decodeIssueSearch = Schema.decodeUnknownEffect(
  Schema.fromJsonString(
    Schema.Struct({
      items: Schema.Array(Issue),
      total_count: Schema.Number,
      incomplete_results: Schema.Boolean,
    }),
  ),
);

export function toGitHubIssues(rows: ReadonlyArray<typeof Issue.Type>): ReadonlyArray<GitHubIssue> {
  return rows
    .filter((row) => row.pull_request === undefined)
    .map((row) => ({
      number: row.number,
      title: row.title,
      url: row.html_url,
      state: row.state,
      author:
        row.user === null
          ? null
          : { login: row.user.login, name: null, avatarUrl: row.user.avatar_url },
      labels: row.labels.map((label) => ({ name: label.name, color: label.color })),
      updatedAt: row.updated_at,
    }));
}
