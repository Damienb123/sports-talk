export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
};

export type League = {
  id: string; name: string; abbreviation: string; sport: string; created_at: string;
};
export type Team = {
  id: string; league_id: string; name: string; city: string | null;
  abbreviation: string; logo_url: string | null; created_at: string;
};
export type GameStatus = "scheduled" | "live" | "final" | "postponed" | "cancelled";
export type Game = {
  id: string; league_id: string; home_team_id: string; away_team_id: string;
  starts_at: string; status: GameStatus; home_score: number | null;
  away_score: number | null; created_at: string;
};
export type GameRoom = { id: string; game_id: string; created_at: string };
export type Message = {
  id: string; room_id: string; user_id: string; content: string; created_at: string;
};

// Mirrors the approved migrations, including relationship names for typed joins.
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Pick<Profile, "id" | "username"> & Partial<Omit<Profile, "id" | "username">>;
        Update: Partial<Pick<Profile, "username" | "display_name" | "avatar_url">>;
        Relationships: [];
      };
      leagues: {
        Row: League;
        Insert: Pick<League, "name" | "abbreviation" | "sport"> & Partial<League>;
        Update: Partial<League>;
        Relationships: [];
      };
      teams: {
        Row: Team;
        Insert: Pick<Team, "league_id" | "name" | "abbreviation"> & Partial<Team>;
        Update: Partial<Team>;
        Relationships: [{
          foreignKeyName: "teams_league_id_fkey";
          columns: ["league_id"];
          isOneToOne: false;
          referencedRelation: "leagues";
          referencedColumns: ["id"];
        }];
      };
      games: {
        Row: Game;
        Insert: Pick<Game, "league_id" | "home_team_id" | "away_team_id" | "starts_at"> & Partial<Game>;
        Update: Partial<Game>;
        Relationships: [
          { foreignKeyName: "games_league_id_fkey"; columns: ["league_id"]; isOneToOne: false; referencedRelation: "leagues"; referencedColumns: ["id"] },
          { foreignKeyName: "games_home_team_id_fkey"; columns: ["home_team_id", "league_id"]; isOneToOne: false; referencedRelation: "teams"; referencedColumns: ["id", "league_id"] },
          { foreignKeyName: "games_away_team_id_fkey"; columns: ["away_team_id", "league_id"]; isOneToOne: false; referencedRelation: "teams"; referencedColumns: ["id", "league_id"] },
        ];
      };
      game_rooms: {
        Row: GameRoom;
        Insert: Pick<GameRoom, "game_id"> & Partial<GameRoom>;
        Update: Partial<GameRoom>;
        Relationships: [{
          foreignKeyName: "game_rooms_game_id_fkey";
          columns: ["game_id"];
          isOneToOne: true;
          referencedRelation: "games";
          referencedColumns: ["id"];
        }];
      };
      messages: {
        Row: Message;
        Insert: Pick<Message, "room_id" | "user_id" | "content"> & Partial<Pick<Message, "id" | "created_at">>;
        Update: Partial<Message>;
        Relationships: [
          { foreignKeyName: "messages_room_id_fkey"; columns: ["room_id"]; isOneToOne: false; referencedRelation: "game_rooms"; referencedColumns: ["id"] },
          { foreignKeyName: "messages_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
