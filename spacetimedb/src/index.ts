// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS
// ─────────────────────────────────────────────────────────────────────────────
import { schema, t, table, SenderError } from 'spacetimedb/server';

const user = table(
  {
    name: 'user',
    public: true,
    indexes: [{ name: 'user_auth_id', algorithm: 'btree', columns: ['authId'] }],
  },
  {
    identity: t.identity().primaryKey(),
    name: t.string().optional(),
    authId: t.string().optional(),
    online: t.bool(),
  }
);

const message = table(
  { name: 'message', public: true },
  { sender: t.identity(), sent: t.timestamp(), text: t.string() }
);

const spacetimedb = schema({ user, message });
export default spacetimedb;

function validateName(name: string) {
  if (!name) throw new SenderError('Names must not be empty');
}

export const set_name = spacetimedb.reducer(
  { name: t.string() },
  (ctx, { name }) => {
    validateName(name);
    const user = ctx.db.user.identity.find(ctx.sender);
    if (!user) throw new SenderError('Cannot set name for unknown user');

    // Check uniqueness: no other user should have this name
    for (const other of ctx.db.user.iter()) {
      if (other.name === name && !other.identity.isEqual(ctx.sender)) {
        throw new SenderError('Name is already taken');
      }
    }

    console.info(`User ${ctx.sender} sets name to ${name}`);
    ctx.db.user.identity.update({ ...user, name });
  }
);

export const link_account = spacetimedb.reducer(
  { authId: t.string() },
  (ctx, { authId }) => {
    const currentUser = ctx.db.user.identity.find(ctx.sender);
    if (!currentUser) throw new SenderError('Unknown user');

    // Already linked with this authId — no-op
    if (currentUser.authId === authId) return;

    // Check if another user already has this authId (same account, different device)
    const existingUsers = [...ctx.db.user.user_auth_id.filter(authId)];
    const oldUser = existingUsers.find(u => !u.identity.isEqual(ctx.sender));

    if (oldUser) {
      // Merge: transfer old user's name to current user
      const mergedName = oldUser.name || currentUser.name;

      // Delete the old user row
      ctx.db.user.identity.delete(oldUser.identity);

      // Update current user with authId and merged name
      ctx.db.user.identity.update({ ...currentUser, authId, name: mergedName });
      console.info(`Merged user ${oldUser.identity} into ${ctx.sender} via authId ${authId}`);
    } else {
      // No existing user with this authId — just set it
      ctx.db.user.identity.update({ ...currentUser, authId });
      console.info(`Linked authId ${authId} to user ${ctx.sender}`);
    }
  }
);

function validateMessage(text: string) {
  if (!text) throw new SenderError('Messages must not be empty');
}

export const send_message = spacetimedb.reducer(
  { text: t.string() },
  (ctx, { text }) => {
    // Things to consider:
    // - Rate-limit messages per-user.
    // - Reject messages from unnamed user.
    validateMessage(text);
    console.info(`User ${ctx.sender}: ${text}`);
    ctx.db.message.insert({
      sender: ctx.sender,
      text,
      sent: ctx.timestamp,
    });
  }
);

// Called when the module is initially published
export const init = spacetimedb.init(_ctx => {});

export const onConnect = spacetimedb.clientConnected(ctx => {
  const user = ctx.db.user.identity.find(ctx.sender);
  if (user) {
    // If this is a returning user, i.e. we already have a `User` with this `Identity`,
    // set `online: true`, but leave `name` and `identity` unchanged.
    ctx.db.user.identity.update({ ...user, online: true });
  } else {
    // If this is a new user, create a `User` row for the `Identity`,
    // which is online, but hasn't set a name.
    ctx.db.user.insert({
      name: undefined,
      identity: ctx.sender,
      online: true,
    });
  }
});

export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  const user = ctx.db.user.identity.find(ctx.sender);
  if (user) {
    ctx.db.user.identity.update({ ...user, online: false });
  } else {
    // This branch should be unreachable,
    // as it doesn't make sense for a client to disconnect without connecting first.
    console.warn(
      `Disconnect event for unknown user with identity ${ctx.sender}`
    );
  }
});
