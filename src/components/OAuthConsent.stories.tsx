import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import OAuthConsent from "./OAuthConsent";
import { CodeChallengeMethod, ResponseType } from "@/lib/mcp/oauth";

const sampleParams = {
  client_id: "client_demo_abcdef123456",
  redirect_uri: "http://127.0.0.1:33418/callback",
  response_type: ResponseType.CODE,
  code_challenge: "dGVzdC1jb2RlLWNoYWxsZW5nZS1mb3Itc3RvcnlfcGxhY2Vob2xkZXI",
  code_challenge_method: CodeChallengeMethod.S256,
  state: "abc123",
  scope: "mcp",
};

const meta: Meta<typeof OAuthConsent> = {
  component: OAuthConsent,
  title: "Components/Auth/OAuthConsent",
  parameters: {
    layout: "centered",
    nextjs: { appDirectory: true },
  },
  args: {
    clientName: "Claude Desktop",
    scope: "mcp",
    params: sampleParams,
  },
};

export default meta;
type Story = StoryObj<typeof OAuthConsent>;

// Initial state when the user lands on /oauth/authorize without an
// auth_session cookie. The password form is rendered inline.
export const LoggedOut: Story = {
  args: { isLoggedIn: false },
};

// State after a valid auth_session cookie is detected (or after a successful
// inline login). The user picks Allow or Deny.
export const LoggedIn: Story = {
  args: { isLoggedIn: true },
};
