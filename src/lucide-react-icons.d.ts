declare module 'lucide-react/dist/esm/icons/*.js' {
  import type { LucideIcon } from 'lucide-react';

  const icon: LucideIcon;
  export default icon;
}

declare module 'lucide-react/dynamicIconImports.mjs' {
  import dynamicIconImports from 'lucide-react/dynamicIconImports';

  export default dynamicIconImports;
}
