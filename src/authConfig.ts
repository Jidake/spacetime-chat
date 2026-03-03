export const oidcConfig = {
  authority: 'https://auth.spacetimedb.com/oidc',
  client_id: import.meta.env.VITE_SPACETIMEAUTH_CLIENT_ID || 'YOUR_CLIENT_ID',
  redirect_uri: window.location.origin,
  post_logout_redirect_uri: window.location.origin,
  scope: 'openid profile email',
  response_type: 'code',
  automaticSilentRenew: true,
};
