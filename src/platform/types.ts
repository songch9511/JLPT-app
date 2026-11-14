/**
 * What the app asks of the device. The web build has one implementation (web.ts, the behaviour the site has
 * always had); the iOS app replaces it at launch with native.ts. Everything here is synchronous or
 * fire-and-forget for the caller, so screens do not change shape between the two.
 */
export interface Platform {
  /** true inside the iOS app (Capacitor); screens use it to show native-only settings and hide web-only ones */
  readonly native: boolean
  /** Read a word aloud in Japanese. Callers keep the rule: only inside or after a user gesture. */
  speak(text: string): void
  /** Light feedback: `answer` on grading a card, `turn` on swiping to another card, `done` on finishing the day. No-op on the web. */
  haptic(kind: 'answer' | 'turn' | 'done'): void
  /**
   * Hand a JSON file to the user: a download on the web, the share sheet (Files, AirDrop, …) in the app.
   * true / a promise of true once the file was handed over, false when the user cancelled or it failed.
   */
  saveFile(name: string, json: string): boolean | Promise<boolean>
  /** Native only: the system file picker; resolves with the chosen file's text, or null when cancelled. */
  pickFile?(): Promise<string | null>
  /** Clear everything the platform keeps outside the study state (durable copy, reminders, widget). */
  clearDeviceData(): Promise<void>
}
