/// <reference types="nativewind/types" />

// TypeScript 6 exige una declaración para los imports de side-effect de CSS
// (el `import './global.css'` que NativeWind necesita en el layout raíz).
declare module '*.css' {}
