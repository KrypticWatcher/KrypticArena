# Custom /inventory backgrounds

To add a new one:

1. Drop the PNG in this folder (e.g. `skarn-bg.png`).
2. Add an entry to `src/data/inventoryBackgrounds.js`:

```js
{
  id: 'skarn_bg',                 // unique, used internally — pick anything
  name: "Skarn's Background",     // shown in the /inventory_bg dropdown
  imagePath: 'skarn-bg.png',      // just the filename, relative to this folder
  allowedUserIds: ['123456789012345678'], // Discord user IDs who can select this one
}
```

That's it — no other code changes needed. The player then runs `/inventory_bg type:<name>`
to select it (only shows up for the IDs listed in `allowedUserIds`), or
`/inventory_bg type:Default` to go back to the normal background.
