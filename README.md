# Sports Talk

**A real-time social platform for experiencing sports together.**

Sports Talk is a full-stack web application designed to give sports fans a dedicated place to discuss games as they happen. Users can discover games, enter game-specific rooms, participate in live conversations, and connect around the teams and games they care about.

The project is currently being developed as a web application with **Next.js, React, TypeScript, Supabase, and PostgreSQL**, with the longer-term goal of supporting a production mobile experience.

> **Current Development:** Milestone 6 — Favorite Teams

---

## The Problem

Sports conversations are highly time-sensitive.

Fans often watch the same game independently while their conversations are fragmented across group chats, social media posts, forums, or conversations that happen after the game has already ended.

That creates a gap between **watching the game** and **experiencing it socially**.

A fan might see a game-winning shot, controversial call, or major play and want to immediately talk with other people watching the same event. Existing group chats are limited to people the user already knows, while general social platforms mix the conversation with unrelated content.

Sports Talk is being built around a simpler idea:

**Every game should have its own live community.**

Instead of waiting until after the game to discuss what happened, users can enter the room associated with that game and participate in the conversation while the experience is unfolding.

---

## Product Vision

Sports Talk aims to connect fans around individual sporting events rather than a general-purpose social feed.

The core experience is:

```text
Discover a game
      ↓
Enter the Game Room
      ↓
See the live conversation
      ↓
React and talk as the game happens
      ↓
Continue discussing the experience afterward
```

Over time, the platform is intended to provide a personalized sports experience based on the teams and leagues each user follows.

The focus is on the **social experience surrounding sports**, not gambling.

Future prediction features are intended to be non-monetized and centered around friendly game predictions and fan engagement.

---

## Current Application

The core real-time conversation workflow is implemented.

Authenticated users can:

* create an account and sign in
* browse available games
* view teams, game times, scores, and statuses
* enter a Game Room associated with a specific game
* view previous room messages
* send authenticated messages
* receive new messages from other users without refreshing
* participate in room-specific conversations
* safely sign out

Messages are persisted in PostgreSQL and delivered to active users through Supabase Realtime.

---

## Game Rooms

Game Rooms are the central feature of Sports Talk.

Every game has exactly one associated room where fans can discuss that event.

The interface takes inspiration from modern chat applications while remaining focused on sports context.

A Game Room contains:

```text
┌─────────────────────────────────────┐
│ GAME                               │
│ Warriors @ Lakers                  │
│ LIVE • 72–68                       │
├─────────────────────────────────────┤
│ GAME ROOM                          │
│                                    │
│ sportsfan1              8:41 PM    │
│ That was a huge three.             │
│                                    │
│ hoopsfan23              8:42 PM    │
│ They needed that possession.       │
│                                    │
│ sportsfan1              8:42 PM    │
│ This fourth quarter is going to    │
│ be wild.                           │
│                                    │
├─────────────────────────────────────┤
│ Message this game room...    Send  │
└─────────────────────────────────────┘
```

Initial history is loaded from PostgreSQL, while newly created messages are delivered to active room participants through realtime subscriptions.

---

## Current Milestone - Favorite Teams

Development is currently focused on **Milestone 6: Favorite Teams**.

The goal is to begin personalizing Sports Talk around each user's interests.

### Requirements

* `user_teams` relationship table
* follow a team
* unfollow a team
* list the authenticated user's followed teams
* protect favorite-team relationships using PostgreSQL Row-Level Security

### Definition of Done

Favorite-team relationships persist correctly and users can only manage relationships belonging to their own account.

This milestone establishes the data foundation for future personalized game discovery and team-based experiences.

---

## Completed Milestones

### Milestone 1 - Authentication

Implemented the user identity foundation using Supabase Auth.

Features include:

* email/password registration
* login and logout
* server-readable authenticated sessions
* automatic profile creation
* protected application routes
* PostgreSQL Row-Level Security

Each authenticated user is associated with exactly one application profile.

---

### Milestone 2 - Game Data

Introduced the core sports data model.

Implemented:

* leagues
* teams
* games
* game rooms
* development fixtures
* game discovery page
* individual game routes

Each game is associated with exactly one Game Room.

Game data includes teams, scheduled start time, game status, and scores when available.

---

### Milestone 3 - Basic Game Room

Built the initial social experience.

Implemented:

* message data model
* historical message loading
* author attribution
* chronological message rendering
* Game Room interface
* message composer
* empty and error states
* responsive mobile/desktop layouts

Initial message history is loaded server-side.

---

### Milestone 4 - Message Sending

Connected the Game Room composer to PostgreSQL.

Implemented:

* authenticated message creation
* server-side message mutation
* server-derived user identity
* server-derived Game Room identity
* message validation
* PostgreSQL persistence
* RLS authorization
* duplicate-submit protection
* failure recovery

The browser is never trusted to determine message authorship.

The authenticated identity is resolved server-side and independently protected by database authorization.

---

### Milestone 5 - Realtime Messaging

Added live message delivery between active Game Room participants.

Implemented:

* Supabase Realtime
* room-specific PostgreSQL change subscriptions
* automatic incoming-message rendering
* message ID deduplication
* chronological ordering
* subscription cleanup
* reconnect/catch-up handling
* cross-room isolation

Two users in the same room can participate in a live conversation without manually refreshing the page.

---

## Technology Stack

### Frontend

**Next.js**
Provides the application framework, App Router, server rendering, routing, Server Actions, and production build system.

**React**
Powers interactive UI components including Game Rooms, message history, and the message composer.

**TypeScript**
Provides static typing across frontend components, server code, database operations, and application models.

**Tailwind CSS**
Provides responsive styling and mobile-first layout utilities.

**shadcn/ui**
Provides reusable UI primitives used throughout the interface.

### Backend and Data

**Supabase**
Provides authentication, PostgreSQL infrastructure, browser/server clients, and realtime database events.

**PostgreSQL**
Acts as the primary source of truth for application data.

The relational model currently includes:

```text
auth.users
    │
    ▼
profiles
    │
    ├───────────────┐
    │               │
    ▼               ▼
user_teams       messages
                    │
                    ▼
                 game_rooms
                    │
                    ▼
                   games
              ┌─────┴─────┐
              ▼           ▼
          home_team    away_team
              │           │
              └─────┬─────┘
                    ▼
                  teams
                    │
                    ▼
                 leagues
```

`user_teams` represents the current Milestone 6 work.

### Realtime

**Supabase Realtime / PostgreSQL Changes**

New message inserts are published from PostgreSQL and delivered to clients subscribed to the corresponding Game Room.

Subscriptions are scoped by room rather than subscribing every user to all platform messages.

### Authentication

**Supabase Auth**

Authentication supports:

* signup
* email confirmation
* login
* logout
* server-side session access
* protected routes

Application authorization is additionally enforced at the PostgreSQL layer.

---

## Security

Sports Talk follows a defense-in-depth authorization model.

Authentication alone is not treated as sufficient authorization.

PostgreSQL **Row-Level Security (RLS)** protects user-owned resources.

For example, message creation requires the authenticated Supabase identity to match the author associated with the inserted message.

```text
Browser
   │
   ▼
Server validation
   │
   ▼
Authenticated Supabase session
   │
   ▼
PostgreSQL
   │
   ▼
Row-Level Security
```

The application does not expose Supabase service-role credentials to browser code.

Message author identity is determined from the authenticated session rather than trusting a user ID submitted by the browser.

Favorite-team relationships introduced in Milestone 6 follow the same ownership model.

---

## Message Architecture

A message follows this path:

```text
User writes message
        │
        ▼
Message Composer
        │
        ▼
Next.js Server Action
        │
        ▼
Server validation
        │
        ▼
auth.getUser()
        │
        ▼
Resolve Game → Game Room
        │
        ▼
PostgreSQL INSERT
        │
        ▼
RLS authorization
        │
        ▼
Message persisted
        │
        ▼
Supabase Realtime
        │
        ▼
Other room participants
```

PostgreSQL remains the source of truth.

Realtime delivery does not replace database persistence.

---

## Realtime Architecture

Initial Game Room history is server-rendered from persisted data.

After the room loads, a client-side subscription listens for future message inserts associated with that room.

```text
                 PostgreSQL
                     │
                     │ INSERT
                     ▼
              Supabase Realtime
                     │
           ┌─────────┴─────────┐
           ▼                   ▼
       Browser A           Browser B
       Game 123            Game 123
```

Messages are deduplicated using their database-generated message IDs.

Leaving or changing a Game Room removes the previous realtime subscription to prevent stale listeners.

---

## Database Model

The application currently uses the following primary domain tables:

### `profiles`

Application identity associated with an authenticated Supabase user.

### `leagues`

Represents sports leagues.

Example:

`NBA`

### `teams`

Represents teams belonging to a league.

### `games`

Represents scheduled, live, completed, postponed, or cancelled games.

Each game references:

* league
* home team
* away team
* start time
* status
* optional scores

### `game_rooms`

Represents the conversation associated with a game.

Each game has exactly one Game Room.

### `messages`

Stores persisted Game Room messages.

Each message belongs to:

* one Game Room
* one authenticated profile

Message content is validated in the UI, server layer, and PostgreSQL.

### `user_teams`

Current Milestone 6 work.

Represents the relationship between a user and the teams they follow.

The relationship will support:

* following teams
* unfollowing teams
* retrieving favorite teams
* future personalized game discovery

---

## Testing

The project uses automated tests and browser-level scenarios throughout development.

Current test coverage includes areas such as:

* authentication
* profile creation
* route protection
* game queries
* Game Room loading
* message validation
* message persistence
* RLS expectations
* author attribution
* duplicate message prevention
* realtime delivery
* cross-room isolation
* subscription cleanup
* responsive Game Room behavior

The current realtime milestone completed with:

* **63 automated tests**
* **9 browser scenarios**
* TypeScript validation
* lint validation
* production build verification

Testing continues to expand with each milestone.

---

## Development Approach

Sports Talk is being developed incrementally through clearly defined milestones.

Each milestone has:

1. requirements
2. explicit scope boundaries
3. database/security considerations
4. automated testing
5. browser testing
6. a definition of done
7. hosted Supabase acceptance verification

This keeps features isolated enough to test independently before introducing additional system complexity.

The project currently follows:

```text
Authentication
      ↓
Game Data
      ↓
Basic Game Rooms
      ↓
Message Persistence
      ↓
Realtime Messaging
      ↓
Favorite Teams        ← Current
      ↓
Personalization
      ↓
Additional Social Features
```

---

## Development Status

Sports Talk is under active development and is **not currently a production application**.

### Completed

* Authentication
* Profiles
* Game data model
* Game discovery
* Game Rooms
* Message history
* Message persistence
* Message authorization
* Realtime messaging
* Responsive chat interface

### In Progress

**Favorite Teams**

* follow/unfollow relationships
* user-specific team preferences
* RLS ownership protection

### Planned

Future development may include:

* personalized game discovery
* favorite-team game filtering
* game schedules
* upcoming-game reminders
* improved game status handling
* live sports-data integration
* non-monetized game predictions
* reactions and additional social interactions
* notifications
* richer user profiles
* moderation and reporting
* mobile application support

Features listed as planned are not yet implemented and may change as the product evolves.

---

## Product Principles

Sports Talk is being designed around several principles:

**Game-first social interaction**
Conversation centers around the sporting event rather than a generic social feed.

**Realtime by default**
Sports reactions lose much of their value when the conversation happens hours later.

**Database-backed communication**
Realtime events enhance persisted data rather than replacing it.

**Authorization at the data layer**
User-owned resources are protected using PostgreSQL Row-Level Security in addition to application validation.

**Mobile-first experience**
Game Rooms are designed around the way many fans watch sports: with a phone available while watching the game.

**Sports experience over gambling**
Prediction functionality is intended for entertainment and fan discussion, not monetary wagering.

---

## Project Goals

The immediate engineering goal is to complete the foundational social platform:

```text
Identity
   +
Sports Data
   +
Game Rooms
   +
Messaging
   +
Realtime
   +
User Preferences
```

Once those foundations are stable, development can move toward external sports-data ingestion, schedules, reminders, personalization, and broader social functionality.
