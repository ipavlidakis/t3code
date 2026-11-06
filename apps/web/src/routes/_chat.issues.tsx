import { createFileRoute } from "@tanstack/react-router";
import { GitHubIssuesPage } from "../components/issues/GitHubIssuesPage";

export const Route = createFileRoute("/_chat/issues")({ component: GitHubIssuesPage });
