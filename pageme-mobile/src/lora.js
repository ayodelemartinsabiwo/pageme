export function shouldStartLora({ activated, capacitor, plugin }) {
  return Boolean(activated && capacitor && plugin);
}
