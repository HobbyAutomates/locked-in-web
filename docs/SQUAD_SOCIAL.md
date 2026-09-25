# Squad reactions and read receipts (v2.11)

Needs `supabase/schema_v35.sql` (undo with `supabase/revert_v35.sql`). Until it is applied, both apps hide reaction chips, ticks and unread badges, and reacting says the server needs the update.

## Reactions
- Six reactions: ❤️ 🔥 👍 😂 😮 💪. One per person per post (`bandlog.post_reactions`, primary key `(post_id, user_id)`). Picking a different emoji replaces yours; picking the same one removes it.
- Feed posts and Chat messages. Android: long-press opens the bar (Delete sits under it for posts you may delete). Web: hover shows "+😊", long-press on touch, or the "+😊" under a Feed post; Delete stays in the ⋯ menu. Double-tap a Feed post for a quick ❤️ (it never removes one).
- Chips under the post ("❤️ 3 🔥 2"), with yours highlighted. Tap them to see who reacted. Tap your own row there to remove yours.
- Counts and your own emoji come back with `group_feed` (two appended columns), so there's no extra request per poll.
- Event: `reaction_added` (see ADMIN.md).

## Read receipts and unread
- `bandlog.group_reads` holds one `last_read_at` per member per squad. Apps call `mark_read(g)` (debounced) while Chat is open and new messages arrive.
- Under your latest message: grey ✓ = sent, nobody has read it yet; blue ✓✓ "Seen by N"; "Seen by everyone". Tap it for who has seen it (with the time) and who hasn't. It's computed from `group_reads` against the message's `created_at`; there's no per-message receipt table.
- Unread badges on the squad list and the Chat tab come from `my_unread_counts()` (Chat's messages and photos from other people since your `last_read_at`, or since you joined).
- When v35 is applied, every existing member is marked "read up to now", so nobody opens v2.11 to a huge badge.

## Privacy
- Only squad members can see a squad's reactions and read status. RLS on both tables and the `is_member` checks in every RPC enforce this. You can only write your own reaction and your own read marker.
- **Read receipts can be turned off later under Profile → Privacy.** There is no switch in v2.11. The plan: a `profiles.read_receipts` flag that, when off, makes `group_read_status` return null `last_read_at` for you, and also hides other people's ticks from you (WhatsApp's two-way rule). Unread badges would still work, because they only use your own marker.
