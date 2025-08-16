# Component Styling with SCSS Modules

This project uses **SCSS Modules** for component-specific styling to ensure:

- **Scoped styles** - No CSS conflicts between components
- **Type safety** - Full TypeScript support for CSS classes
- **Maintainability** - Styles are co-located with components
- **Performance** - Only styles that are used get included in the bundle

## File Structure

```
src/components/
├── ComponentName/
│   ├── ComponentName.tsx          # React component
│   ├── ComponentName.module.scss  # Component-specific styles
│   └── index.ts                   # Export file
```

## Usage Example

### 1. Create the SCSS Module

```scss
// Button.module.scss
.button {
  display: inline-flex;
  align-items: center;
  padding: 0.6em 1.2em;
  border-radius: 8px;
  transition: all 0.25s ease;

  &:hover {
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.primary {
  @extend .button;
  background-color: #007bff;
  color: white;
}

.secondary {
  @extend .button;
  background-color: #6c757d;
  color: white;
}
```

### 2. Use in React Component

```tsx
// Button.tsx
import React from 'react';
import styles from './Button.module.scss';

interface ButtonProps {
  variant?: 'primary' | 'secondary';
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({ variant = 'primary', children }) => {
  const buttonClass = variant === 'primary' ? styles.primary : styles.secondary;

  return <button className={buttonClass}>{children}</button>;
};

export default Button;
```

## Best Practices

1. **Use descriptive class names** - Make them self-documenting
2. **Leverage SCSS features** - Use `@extend`, `&` selector, variables
3. **Keep styles scoped** - Avoid global styles in component modules
4. **Use TypeScript** - Export component prop types for reusability
5. **Create index files** - Simplify imports with barrel exports

## Available Components

- **Button** - Versatile button component with multiple variants
  - Variants: primary, secondary, outline
  - Sizes: small, medium, large
  - States: disabled, loading, with icon

## Global Styles

Global styles are defined in `src/styles/globals.scss` and imported in `src/index.css`. These include:

- Base typography rules
- Global element styles
- Utility classes
- Responsive breakpoints
