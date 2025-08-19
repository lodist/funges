# Centralized Color System

This directory contains the centralized color system for the Fung.es application. All colors are defined in a single location to ensure consistency and maintainability.

## Files

- `colors.ts` - Main color definitions and utility functions
- `color-utils.ts` - Helper functions and class mappings for consistent usage
- `design-tokens.ts` - Design tokens that import from the centralized color system

## Color System Overview

### 1. Base Color Palette (`colors.ts`)

The main color system is defined in `colors.ts` with the following structure:

```typescript
export const colors = {
  // Primary brand colors (green theme)
  primary: { 50: '#f0f9f4', 100: '#dcf2e3', ..., 900: '#102517' },

  // Neutral grays
  neutral: { 50: '#fafafa', 100: '#f5f5f5', ..., 900: '#171717' },

  // Status colors
  status: { success: '#4cba73', warning: '#f59e0b', error: '#ef4444', info: '#3b82f6' },

  // Theme-specific semantic colors
  light: { text: {...}, background: {...}, hover: {...} },
  dark: { text: {...}, background: {...}, hover: {...} },

  // Map-specific colors
  map: { mushrooms: {...}, berries: {...}, herbs: {...}, nuts: {...} },

  // Score colors
  score: { excellent: {...}, good: {...}, fair: {...}, poor: {...} }
}
```

### 2. Utility Functions

#### Theme-aware color getters:

```typescript
import {
  getThemeColor,
  getScoreColor,
  getSpeciesColorScale,
} from '@/lib/colors';

// Get theme-specific colors
const textColor = getThemeColor('text', 'light'); // Returns light theme text color

// Get score-based colors
const scoreColor = getScoreColor(8.5, 'light'); // Returns excellent color

// Get species-specific color scales
const herbColors = getSpeciesColorScale('herbs', 'light'); // Returns herb color array
```

#### Color class mappings:

```typescript
import { colorClasses, colorCombinations } from '@/lib/color-utils';

// Use predefined color classes
className={colorClasses.text.primary} // "text-text-primary"
className={colorClasses.background.brand} // "bg-primary"

// Use predefined combinations
className={colorCombinations.button.primary} // Complete button styling
```

## Usage Guidelines

### 1. For Components

**Preferred approach - Use shadcn/ui classes:**

```tsx
// ✅ Good - Use shadcn/ui semantic classes
<Button className="bg-primary text-primary-foreground hover:bg-primary/90">
  Click me
</Button>

<Card className="bg-card text-card-foreground border border-border">
  Content
</Card>
```

**Alternative - Use custom semantic classes:**

```tsx
// ✅ Good - Use custom semantic classes
<div className="text-text-primary bg-background-primary">
  Content
</div>

<button className="bg-hover-primary text-text-primary">
  Hover me
</button>
```

**Avoid - Direct color values:**

```tsx
// ❌ Avoid - Hardcoded colors
<div className='text-[#1a1a1a] bg-[#fafafa]'>Content</div>
```

### 2. For Dynamic Colors

**Use utility functions:**

```tsx
import { getScoreColor, getColorForScore } from '@/lib/colors';

// For score-based colors
const scoreColor = getScoreColor(score, theme);

// For species-specific colors
const speciesColor = getColorForScore(score, 'mushrooms', theme);
```

### 3. For CSS Variables

**Use CSS custom properties:**

```css
.my-component {
  color: var(--text-primary);
  background-color: var(--background-primary);
  border-color: var(--border);
}
```

## Color Naming Convention

### Semantic Names

- `primary` - Main brand color
- `secondary` - Secondary brand color
- `muted` - Muted/subtle colors
- `accent` - Accent colors
- `destructive` - Error/danger colors

### Theme-aware Names

- `text-primary` - Main text color
- `text-secondary` - Secondary text color
- `background-primary` - Main background color
- `background-secondary` - Secondary background color
- `hover-primary` - Primary hover state
- `hover-secondary` - Secondary hover state

### Scale-based Names

- `primary-50` through `primary-900` - Primary color scale
- `neutral-50` through `neutral-900` - Neutral color scale

## Integration with Tailwind CSS

The color system is integrated with Tailwind CSS through:

1. **Tailwind Config** (`tailwind.config.js`) - Imports colors from the centralized system
2. **CSS Variables** (`src/index.css`) - Defines CSS custom properties for theme switching
3. **Design Tokens** (`src/styles/design-tokens.ts`) - Provides design system tokens

## Theme Switching

The color system supports both light and dark themes through CSS custom properties. Theme switching is handled by the `ThemeProvider` component, which adds/removes the `dark` class on the root element.

## Migration Guide

When updating existing components:

1. **Replace hardcoded colors** with semantic classes
2. **Use shadcn/ui classes** when possible
3. **Import utility functions** for dynamic colors
4. **Test both light and dark themes**

### Example Migration

**Before:**

```tsx
<div className='text-[#1a1a1a] bg-[#fafafa] border-[#e5e5e5]'>
  <button className='bg-[#4cba73] text-white hover:bg-[#3d955c]'>
    Click me
  </button>
</div>
```

**After:**

```tsx
<div className='text-text-primary bg-background-primary border-border'>
  <button className='bg-primary text-primary-foreground hover:bg-primary/90'>
    Click me
  </button>
</div>
```

## Benefits

1. **Consistency** - All colors come from a single source
2. **Maintainability** - Easy to update colors across the entire application
3. **Theme Support** - Built-in light/dark theme support
4. **Type Safety** - Full TypeScript support with proper types
5. **Performance** - CSS custom properties for efficient theme switching
6. **Accessibility** - Proper contrast ratios and semantic color usage
