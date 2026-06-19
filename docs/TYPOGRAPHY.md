# Typography

Tailwind `text-*` classes map to **roles**, not fonts. They look nearly identical on
screen because the desktop scale is dense, but the choice changes vertical rhythm
(line-height) and signals intent to future readers.

| Class          | Size      | Line-height | Role                                                                              |
| -------------- | --------- | ----------- | --------------------------------------------------------------------------------- |
| `text-control` | 11 px     | **1.25**    | Forms / inputs **only**. Form-field labels, input text, kbd hints, chip-button text. |
| `text-xs`      | 11 px     | **1.35**    | Default small **body**. Paragraphs, table cells, list rows, descriptions, settings copy, full sentences, error messages. |
| `text-caption` | 9.36 px   | **1.30**    | Super-tiny **meta**. Timestamps, version labels, file-row metadata (date / size / extension), empty states (`No items`, `Never synced`), microcounts (`3 visible`, `N selected`), helper hints under a value, sidebar header fallback subtitles. |
| `text-micro`   | 9 px      | **1.25**    | Badges / labels **only**. Pills, status badges, tags, axis labels (`Less` / `More`), section eyebrows (uppercase `tracking-wide`), tab labels, status dots' copy, count chips. |

## Decision order

When you reach for a text size, walk this list top-down and stop at the first match:

1. **Eyebrow, badge, pill, status chip, axis label, uppercase tag?** → `text-micro`
2. **Form field, input, kbd hint, button chip?** → `text-control`
3. **Full sentence / paragraph body content?** → `text-xs`
4. **Tiny meta fragment under a value** (timestamp, count, hint)? → `text-caption`

## Don't

- Don't use `text-caption` for `<p>` descriptions under section headers — use `text-xs`.
  `text-caption` is one notch too dense for paragraph-of-words reading.
- Don't use `text-micro` for sub-paragraphs under a value — that's `text-caption` if it's
  truly one-five words, or `text-xs` if it's a sentence.
- Don't mix `text-xs` and `text-caption` for sibling paragraphs at the same level —
  pick one and stay consistent.
- Don't reach for `text-sm` / `text-base` for "I just want it smaller than default."
  These classes have their own roles (`text-sm` is the default body for narrow surfaces,
  `text-base` for prose), not arbitrary step-ups.

## Reference

Defined in `src/index.css` under `@theme inline { --text-* }`:

- `text-control: 0.6875rem / 1.25`
- `text-xs:      0.6875rem / 1.35`
- `text-caption: 0.585rem   / 1.30`
- `text-micro:   0.5625rem / 1.25`
