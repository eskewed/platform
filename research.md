### UI and Frontend Analysis

- Looked through `packages/ui` and `packages/theme`, plus app entries in `dev/prod` and `desktop`, and the routing metadata to map how the UI boots, routes, and gets its styles. This document summarizes the entry points, routing model, styling system, and concrete ways to customize the look and feel.

### Where the frontend lives
- packages
  - `packages/ui`: Svelte UI library (components, Root, routing helpers, exports).
  - `packages/theme`: Theme provider component and the design system (SCSS variables, utilities, fonts).
- apps
  - `dev/prod`: Web app that boots the UI library.
  - `desktop`: Electron UI that boots the same UI library.
- `plugins/*-resources`: feature bundles with Svelte components, loaded via routing metadata.

### App entry points
- Web app bundles the theme styles and bootstraps the UI:
```js
// dev/prod/webpack.config.js
entry: {
  bundle: ['@hcengineering/theme/styles/global.scss', ...(dev ? ['./src/main-dev.ts'] : ['./src/main.ts'])]
}
```
```ts
// dev/prod/src/main.ts
import { createApp } from '@hcengineering/ui'
import { configurePlatform } from './platform'

configurePlatform().then(() => {
  createApp(document.body)
})
```
- The UI library exposes `createApp`, mounting the `Root` Svelte component:
```ts
// packages/ui/src/index.ts
export function createApp (target: HTMLElement): SvelteComponent {
  return new Root({ target })
}
```
- Desktop app does the same, with its own entry and webpack config (also loading the theme’s `global.scss`).

### Routing model (no SvelteKit)
- Custom route state in `packages/ui/src/location.ts`; history API + localStorage:
```ts
export function navigate (location: PlatformLocation, replace = false): boolean {
  closePopup()
  const cur = locationToUrl(getCurrentLocation())
  const url = locationToUrl(location)
  if (cur !== url) {
    const data = !desktopPlatform ? null : { location }
    const _url = !desktopPlatform ? url : undefined
    if (replace) {
      history.replaceState(data, '', _url)
    } else {
      history.pushState(data, '', _url)
    }
    localStorage.setItem(locationStorageKeyId, JSON.stringify(location))
    if (location.path[1] !== undefined) {
      localStorage.setItem(`${locationStorageKeyId}_${location.path[1]}`, JSON.stringify(location))
    }
    locationWritable.set(location)
    Analytics.navigate(url)
    return true
  }
  return false
}
```
- Routes are configured via metadata (plugin pattern). Default app and route map are set during platform configuration:
```ts
// dev/prod/src/platform.ts
setMetadata(uiPlugin.metadata.DefaultApplication, login.component.LoginApp)
...
setMetadata(
  uiPlugin.metadata.Routes,
  new Map([
    [workbenchId, workbench.component.WorkbenchApp],
    [loginId, login.component.LoginApp],
    [onboardId, onboard.component.OnboardApp],
    [githubId, github.component.ConnectApp],
    [calendarId, calendar.component.ConnectApp],
    [guestId, guest.component.GuestApp]
  ])
)
```
- The `Root` component reads route metadata and renders the current app.

### Theme provider and global styling
- Root wraps the entire UI in the `Theme` component, and uses utility classes supplied by the theme:
```svelte
<!-- packages/ui/src/components/internal/Root.svelte -->
<Theme>
  <div id="ui-root" class:mobile-theme={isMobile}>
    <div class="antiStatusBar">
      <div class="flex-row-center h-full content-color gap-3 px-4">
        {#if desktopPlatform}
          <div class="history-box flex-row-center gap-3">
            <button
              id="statusbar-back"
              class="antiButton ghost jf-center bs-none no-focus resetIconSize statusButton square"
              style:color={'var(--theme-dark-color)'}
```
- `Theme.svelte` controls document `<html>` classes (e.g., `theme-dark` / `theme-light` and font size), drives language, and exposes setters via Svelte context:
```ts
// packages/theme/src/Theme.svelte
document.documentElement.setAttribute('class', `${getRealTheme(theme)} ${getCurrentFontSize()}`)
setOptions(getCurrentFontSize(), theme, getCurrentLanguage())
...
const setRootFontSize = (fontsize: string, set = true) => {
  currentFontSize.set(fontsize)
  if (set) {
    localStorage.setItem('fontsize', fontsize)
  }
  document.documentElement.setAttribute('class', `${getRealTheme(getCurrentTheme())} ${fontsize}`)
}
```
- Theme store API you can subscribe to:
```ts
// packages/theme/src/index.ts
export class ThemeOptions {
  constructor (
    readonly fontSize: number,
    readonly dark: boolean,
    readonly language: string
  ) {}
}
export const themeStore = writable<ThemeOptions>()

export function initThemeStore (): void {
  themeStore.set(
    new ThemeOptions(
      getCurrentFontSize() === 'normal-font' ? 16 : 14,
      isThemeDark(getCurrentTheme()),
      getCurrentLanguage()
    )
  )
}
```

### Design system structure (SCSS)
- Global stylesheet aggregates all partials:
```scss
// packages/theme/styles/global.scss
@import "./_vars.scss";
@import "./_colors.scss";
@import "./_lumia-colors.scss";
@import "./_layouts.scss";
@import "./_print.scss";
@import "./common.scss";
@import "./button.scss";
@import "./editors.scss";
@import "./components.scss";
@import "./dialogs.scss";
@import "./popups.scss";
@import "./mixins.scss";
@import "./panel.scss";
@import "./prose.scss";
@import "./tables.scss";
@import "./_text-editor.scss";
```
- Core variables (spacing, radii, etc.) live in `_vars.scss`. Fonts are registered in `global.scss`.
- Color tokens and component CSS variables are defined per theme and applied via `.theme-dark` and `.theme-light` on `<html>`:
```scss
/* Dark Theme */
.theme-dark {
  --theme-text-primary-color: rgba(255, 255, 255, .8);
  --theme-text-placeholder-color: rgba(255, 255, 255, .4);
  ...
  --theme-bg-color: #1A1A28;
  --theme-statusbar-color: #1A1928;
  --theme-navpanel-color: #14141F;
  --theme-navpanel-hovered: rgba(255, 255, 255, .04);
  --theme-navpanel-selected: rgba(255, 255, 255, .08);
  --theme-divider-color: rgba(255, 255, 255, .06);
  ...
}
```
- Utility classes (flex/spacing/typography) are in `_layouts.scss`:
```scss
.flex-row-center {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  min-width: 0;
  min-height: 0;
}
```
- Button system (`.antiButton` variants, sizes, states):
```scss
.antiButton {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  min-width: 1.375rem;
  white-space: nowrap;
  font-size: .8125rem;
  color: var(--theme-content-color);
  background-color: transparent;
  border: 1px solid transparent;
}
```
```scss
&.statusButton {
  padding: 0 8px;
  height: 28px;
  min-width: 20px;
  font-size: 13px;
  border-radius: 4px;

  &.square {
    flex-shrink: 0;
    padding: 2px;
    width: 28px;
  }
}
```

### Styling stack
- Svelte (v4), webpack, `svelte-loader` with `svelte-preprocess` and PostCSS (Autoprefixer). No SvelteKit.
- Theme SCSS compiled into the bundle (no Tailwind/UnoCSS in core UI/theme; some plugin packages list Tailwind in dev deps but it isn’t wired here).
- Fonts: IBM Plex Sans (declared in `packages/theme/styles/global.scss`).

### How to customize the “look and feel”
- Colors (global)
  - Override CSS variables in `.theme-dark` and `.theme-light`. E.g., primary buttons, status bar, panel backgrounds live in `_colors.scss`.
  - Quick override approach: create a file like `src/styles/brand-overrides.scss` and include after the theme in the bundle, redefining variables:
```scss
/* src/styles/brand-overrides.scss */
.theme-dark {
  --primary-button-default: #0066cc;
  --theme-statusbar-color: #101017;
}
.theme-light {
  --primary-button-default: #0055aa;
  --theme-statusbar-color: #f6f8fa;
}
```
  - Then add it after the theme in the app entry (web):
    - Update the `bundle` entry to: `['@hcengineering/theme/styles/global.scss', './src/styles/brand-overrides.scss', ...(dev ? ['./src/main-dev.ts'] : ['./src/main.ts'])]`.
- Typography, spacing, radii
  - Adjust scales in `packages/theme/styles/_vars.scss` (e.g., `--spacing-*`, border radii). You can also set `--font-family` in `global.scss` or override it in your overrides file.
- Utility/layout classes
  - Use or adapt `_layouts.scss` utilities (`flex-*`, `flex-gap-*`, `content-color` etc.). To change their behavior, override the corresponding class rules in your overrides file.
- Buttons and UI controls
  - Customize the `.antiButton` variants and tokens in `button.scss` via variables (`--theme-button-*`), or override specific class blocks if you need different shapes, paddings, or interactions.
- Component-level tweaks
  - UI components (in `packages/ui`) are largely driven by CSS variables; changes to tokens flow through. For bespoke tweaks, add CSS targeting the component’s classes in your overrides.
- Theme, font size, language at runtime
  - Controlled by `Theme.svelte` with localStorage keys: `theme` = `theme-dark|theme-light|theme-system`, `fontsize` = `normal-font|small-font`, `lang`.
  - You can flip these programmatically before app boot (set localStorage) or via Settings UI. Subscribe to `themeStore` to react in components.

### How to extend routing with your own app
- Add a route to the metadata map and lazy-load the feature bundle in app config:
  - In `dev/prod/src/platform.ts` (or `desktop/src/ui/platform.ts`), extend the `Routes` map and add `addLocation(...)` for your feature package.
  - The `Root` component renders whatever `uiPlugin.metadata.Routes` maps the first path segment to.

### Theming hooks you already have in the UI
- The top bar uses theme tokens (`--theme-statusbar-color`, text colors) and utility classes, so brand changes propagate automatically from variables.

### Where to change default language list and default app
- `dev/prod/src/platform.ts` and `desktop/src/ui/platform.ts` set `uiPlugin.metadata.Languages` and `uiPlugin.metadata.DefaultApplication`.

### Build config
- `svelte-preprocess` is enabled; PostCSS runs Autoprefixer; SCSS is supported by the existing webpack rules. Add your overrides SCSS file and include it in the entry as above.

### Quick checklist
- Colors: override tokens in `.theme-dark/.theme-light`.
- Radii/Spacing/Typography: `_vars.scss` or override CSS variables.
- Buttons: tokens in `_colors.scss` and rules in `button.scss`.
- Bundle order: ensure your overrides come after `@hcengineering/theme/styles/global.scss`.
- Routes: add to metadata map and dynamic imports in platform config.

### Extras
- Minimal snippet to set default theme/font before first paint (optional)
```html
<script>
localStorage.setItem('theme', 'theme-dark');
localStorage.setItem('fontsize', 'normal-font');
</script>
```
- Using the theme store in a component
```svelte
<script lang="ts">
  import { themeStore } from '@hcengineering/theme';
  $: isDark = $themeStore?.dark;
</script>
```
- Invert theme locally (e.g., for preview panes)
```svelte
<script>
  import { InvertedTheme } from '@hcengineering/theme';
</script>

<InvertedTheme>
  <!-- children render with inverted light/dark -->
</InvertedTheme>
```