// Ambient declarations for stylesheet modules so TypeScript accepts imports like
// `import styles from './Something.module.scss'` across the project.
declare module '*.module.scss' {
  const classes: { [key: string]: string };
  export default classes;
}

declare module '*.scss' {
  const content: { [className: string]: string };
  export default content;
}

declare module '*.css' {
  const classes: { [key: string]: string };
  export default classes;
}
