import { getSupabaseClient } from "@/lib/supabase";
import { getIsLoggedIn } from "@/lib/auth";
import OAuthConsent from "@/components/OAuthConsent";
import {
  CodeChallengeMethod,
  DEFAULT_SCOPE,
  ResponseType,
} from "@/lib/mcp/oauth";

interface AuthorizeParams {
  client_id?: string;
  redirect_uri?: string;
  response_type?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  state?: string;
  scope?: string;
}

function ErrorPage({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-card rounded-2xl shadow-sm p-8">
        <h1 className="text-xl text-red-700">{title}</h1>
        <p className="mt-3 text-sm text-gray-700">{detail}</p>
      </div>
    </main>
  );
}

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<AuthorizeParams>;
}) {
  const params = await searchParams;
  const clientId = params.client_id;
  const redirectUri = params.redirect_uri;

  if (!clientId || !redirectUri || params.response_type !== ResponseType.CODE) {
    return (
      <ErrorPage
        title="Invalid authorization request"
        detail="client_id, redirect_uri, and response_type=code are required."
      />
    );
  }
  if (params.code_challenge_method !== CodeChallengeMethod.S256 || !params.code_challenge) {
    return (
      <ErrorPage
        title="PKCE required"
        detail="code_challenge_method=S256 and code_challenge are required."
      />
    );
  }

  const supabase = getSupabaseClient();
  const { data: client } = await supabase
    .from("oauth_clients")
    .select("client_id, client_name, redirect_uris")
    .eq("client_id", clientId)
    .single();

  if (!client) {
    return <ErrorPage title="Unknown client" detail={`No client registered with id ${clientId}.`} />;
  }

  if (!(client.redirect_uris as string[]).includes(redirectUri)) {
    return (
      <ErrorPage
        title="redirect_uri not registered"
        detail="The redirect_uri does not match any URI registered for this client."
      />
    );
  }

  const isLoggedIn = await getIsLoggedIn();
  const scope = params.scope ?? DEFAULT_SCOPE;

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <OAuthConsent
        isLoggedIn={isLoggedIn}
        clientName={client.client_name as string}
        scope={scope}
        params={{
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: ResponseType.CODE,
          code_challenge: params.code_challenge,
          code_challenge_method: params.code_challenge_method,
          state: params.state ?? "",
          scope,
        }}
      />
    </main>
  );
}
