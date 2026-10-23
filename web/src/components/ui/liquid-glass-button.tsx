// Compatibility entry point for the MedAlign liquid-glass button.
// Keep a single implementation so the app's existing Button imports and
// variant/size behavior receive the same treatment as explicit LiquidButton use.
export { Button as LiquidButton } from './button';
