// Modo independiente (vite en :4201). Cuando lo carga el shell no se usa este archivo: entra por ./mount (ver vite.config.ts).
import './styles.css';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
