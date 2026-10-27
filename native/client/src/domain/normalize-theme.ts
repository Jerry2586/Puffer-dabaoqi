import {normalizeVisual} from './visual';
import defaults from './default-theme.json';import type {Theme} from './types';
export function normalizeTheme<T extends Theme>(theme:T):T {
 theme.visual=normalizeVisual(theme.visual,theme.colors);
 theme.integration={version:1,apiBase:'',...theme.integration};
 const memberCard=theme.features?.memberCard??theme.features?.member??true;
 theme.startup={...defaults.startup,...theme.startup};theme.clientSettings={...defaults.clientSettings,...theme.clientSettings};
 theme.features={...defaults.features,...theme.features,memberCard};theme.announcement={...defaults.announcement,...theme.announcement} as Theme['announcement'];
 theme.pageStyles={...defaults.pageStyles,...theme.pageStyles,design:theme.pageStyles?.design==='youku'?'youku':'classic'} as Theme['pageStyles'];return theme;
}
