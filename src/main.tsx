import { StrictMode, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { Identity } from 'spacetimedb';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import { DbConnection, ErrorContext } from './module_bindings/index.ts';
import { AuthProvider, useAuth } from 'react-oidc-context';
import { oidcConfig } from './authConfig.ts';

const HOST = import.meta.env.VITE_SPACETIMEDB_HOST ?? 'ws://localhost:3000';
const DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? 'quickstart-chat';
const TOKEN_KEY = `${HOST}/${DB_NAME}/auth_token`;

const onConnect = (conn: DbConnection, identity: Identity, token: string) => {
  localStorage.setItem(TOKEN_KEY, token);
  console.log(
    'Connected to SpacetimeDB with identity:',
    identity.toHexString()
  );
};

const onDisconnect = () => {
  console.log('Disconnected from SpacetimeDB');
};

const onConnectError = (_ctx: ErrorContext, err: Error) => {
  console.log('Error connecting to SpacetimeDB:', err);
};

function AuthGate() {
  const auth = useAuth();

  const connectionBuilder = useMemo(
    () =>
      DbConnection.builder()
        .withUri(HOST)
        .withDatabaseName(DB_NAME)
        .withToken(localStorage.getItem(TOKEN_KEY) || undefined)
        .onConnect(onConnect)
        .onDisconnect(onDisconnect)
        .onConnectError(onConnectError),
    []
  );

  // When silent renew fails, clear the error and re-trigger login
  // instead of showing a dead-end error screen
  useEffect(() => {
    if (auth.error) {
      console.warn('Auth error, re-triggering login:', auth.error.message);
      auth.removeUser().then(() => auth.signinRedirect());
    }
  }, [auth.error]);

  if (auth.isLoading) {
    return (
      <div className="App">
        <h1>Loading...</h1>
      </div>
    );
  }

  if (auth.error) {
    return (
      <div className="App">
        <h1>Reconnecting...</h1>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    auth.signinRedirect();
    return (
      <div className="App">
        <h1>Redirecting to login...</h1>
      </div>
    );
  }

  const profile = auth.user?.profile;

  return (
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      <App
        oidcProfile={profile}
        onSignOut={() => auth.signoutRedirect()}
      />
    </SpacetimeDBProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider {...oidcConfig}>
      <AuthGate />
    </AuthProvider>
  </StrictMode>
);
