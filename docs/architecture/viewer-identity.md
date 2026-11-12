# Viewer Identity and Character Ownership

**Status:** Foundational draft\
**Version:** 1.0

## 1. Purpose

Separate the human viewer, their accounts on streaming platforms and
their in-world character. This avoids tying persistent world identity to
a mutable platform username.

## 2. Core entities

### Viewer

Represents a person or audience identity within the application.

Suggested fields:

-   `id`
-   `displayName`
-   `createdAt`
-   `status`

### Platform identity

Represents an account on a specific platform.

Suggested fields:

-   `id`
-   `viewerId`
-   `platform`
-   `platformUserId`
-   `platformUsername`
-   `linkedAt`
-   `status`

### Character

Represents an entity living in the simulated world.

Suggested fields:

-   `id` (stable character ID)
-   `viewerId` (nullable for ordinary NPCs)
-   `createdAt`
-   `status`
-   `characterType`

A viewer may eventually have more than one character, but the initial
policy for active character count remains open.

## 3. Relationship model

``` text
Viewer
  id
  displayName
  createdAt
      |
      | one-to-many
      v
PlatformIdentity
  viewerId
  platform
  platformUserId
  platformUsername

Viewer
  id
      |
      | one-to-many (policy initially may limit to one active character)
      v
Character
  id
  viewerId
  status
```

A character's identity in the world should survive username changes and
platform account relinking, subject to moderation and account-recovery
policy.

## 4. Identity rules

-   Use the platform's stable user ID, not username, as the platform
    identity key.
-   Treat usernames and display names as mutable presentation data.
-   Prevent the same platform identity from being linked to multiple
    viewers.
-   Define a safe account-linking and recovery process before
    cross-platform linking is enabled.
-   Do not assume two accounts with similar names belong to the same
    person.
-   Keep platform-specific identity data out of simulation-domain logic
    where possible.

## 5. Character lifecycle

Potential lifecycle states:

-   Pending creation.
-   Active.
-   Temporarily inactive.
-   Dead.
-   Retired or archived.
-   Banned or disabled.

The exact state machine should be defined when character creation and
moderation are implemented.

A viewer leaving the stream should not automatically delete their
character. The world continues to treat that character according to
normal simulation rules.

## 6. Character death and legacy

The preferred direction is meaningful, potentially permanent character
death combined with legacy:

-   A character can die under the same world rules as other characters.
-   Their history and achievements remain in the chronicle.
-   Possessions may pass to heirs or other eligible recipients.
-   Family, home or business may persist where the simulation rules
    support it.
-   The viewer may eventually create a new character.

Unresolved details include descendants, inheritance rules, orphaned
dependants, ownership of businesses and whether a viewer may create a
replacement immediately.

Do not make viewer characters invulnerable merely because they belong to
viewers. If exceptional protections are ever offered, they must be
explicit game rules and consistently applied.

## 7. Moderation and abuse

Define roles separately from character attributes:

-   Viewer.
-   Trusted viewer.
-   Moderator.
-   Streamer.
-   System.

Moderation policy should cover:

-   Banned platform identities.
-   Linked identity bans.
-   Impersonation.
-   Name and appearance abuse.
-   Character creation limits.
-   Command rate limits.
-   Appeals and account recovery.
-   Audit records for administrative actions.

A platform ban should not automatically erase a character's historical
existence. Decide whether the character remains in-world, becomes
inaccessible or is removed through an audited administrative action.

## 8. Privacy and data minimization

Store only the identity information needed for platform integration and
world ownership. Keep private account metadata separate from public
character information. Do not expose platform identifiers through public
world APIs or the stream display.

## 9. Initial implementation policy

For the first simulation milestone, use generated NPC identities only.
Add viewer and platform identity tables when viewer registration is
introduced. This avoids prematurely coupling the simulation foundation
to Twitch authentication.
