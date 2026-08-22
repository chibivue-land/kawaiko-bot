/**
 * Chat commands kawaiko understands when it is @mentioned.
 *
 * Deliberately not Discord slash commands: those need app-level registration
 * and an interactions endpoint, while a mention command works immediately in
 * every channel the bot can already read.
 *
 * Matching is exact (after trimming trailing punctuation) so that ordinary
 * chat that merely contains the word 「忘れて」 is never swallowed as a command.
 */

const RESET_COMMANDS: ReadonlySet<string> = new Set([
  "reset",
  "/reset",
  "!reset",
  "forget",
  "/forget",
  "リセット",
  "りせっと",
  "記憶リセット",
  "会話リセット",
  "メモリリセット",
  "記憶を消して",
  "記憶消して",
  "忘れて",
  "全部忘れて",
  "全部忘れろ",
  "会話を忘れて",
  "ログを忘れて",
  "いったん忘れて",
  "一旦忘れて",
]);

/** Strip surrounding whitespace and trailing punctuation/emphasis. */
function normalizeCommand(text: string): string {
  return text
    .trim()
    .replace(/^[「『"'`]+/u, "")
    .replace(/[」』"'`]+$/u, "")
    .replace(/[。．、，!！?？…\s]+$/u, "")
    .trim()
    .toLowerCase();
}

/**
 * True when the mention body is the "forget this channel" command.
 * The caller is responsible for scoping the reset to the channel it came from.
 */
export function isResetCommand(text: string): boolean {
  return RESET_COMMANDS.has(normalizeCommand(text));
}
