export function authorName(author: { username?: string | null } | null | undefined) {
  return author?.username?.trim() || "Sports fan";
}

export function messageTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: "UTC",
  }).format(new Date(value));
}

export function messageDay(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(new Date(value));
}
