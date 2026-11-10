# Party portrait export

Generate one square painted portrait per image using Codex image generation, then export using the browser codec (no extra Python or codec package):

```
node tools/portraits/portraits.mjs .tmp/portrait-art/sources.json
```

The manifest is a JSON list of `{classId, id, path, prompt}` records. Supply one or more classes (mage, warrior, ranger), with the same positive number of unique two-digit IDs per supplied class; the current five-color set uses 11 through 15. Original images, prompts and a contact sheet stay in `.tmp/portrait-art/`; only small WebPs in `src/ui/portraits/` ship. Existing exports are verified and preserved.

For a supplied portrait sheet, add `original` (a shared source filename) and `crop: {x, y, size}` (a square in source pixels) to each record. Crops must fit inside the source and be at least 192 pixels wide. Use `--replace` to replace those IDs explicitly; previous exports are archived by content hash in `.tmp/portrait-art/`. The tracked provenance catalog is updated only for supplied IDs. The Ranger's current five choices are direct crops from the owner's cinematic portrait sheet, with its gold frames and black margins excluded.
