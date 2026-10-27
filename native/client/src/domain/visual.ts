import schema from './visual-schema.json';
import type {Theme,PageDesign} from './types';
export {schema as visualSchema};
export type VisualStyles=Record<string,Record<string,string|number>>;
export function visualDefaults(colors?:Theme['colors']):VisualStyles {return Object.fromEntries(Object.entries(schema).map(([group,s])=>[group,Object.fromEntries(Object.entries(s.fields).map(([key,f])=>[key,(f as any).token&&colors?colors[(f as any).token as keyof Theme['colors']]:f.default]))]));}
export function normalizeVisual(input?:VisualStyles,colors?:Theme['colors']):VisualStyles {const value=visualDefaults(colors);for(const [group,fields] of Object.entries(value))for(const key of Object.keys(fields))if(input?.[group]?.[key]!==undefined)fields[key]=input[group][key];return value;}
export function visualVariables(theme:Theme):Record<string,string> {const visual=normalizeVisual(theme.visual,theme.colors),vars:Record<string,string>={};for(const [group,fields]of Object.entries(visual))for(const [key,value]of Object.entries(fields))vars['--design-'+group+'-'+key]=String(value)+(typeof value==='number'?(key==='duration'?'ms':key==='overlay'||key==='watermarkOpacity'?'':'px'):'');return vars;}

/** Category appearance follows the configured entry ID, never its editable label or CMS binding. */
export function categoryPageKey(id:string):string {return 'category'+Array.from(id,c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join('');}
export function categoryPages(theme:Theme){return theme.categories.filter(n=>n.enabled&&n.page==='category');}
export function pageDesignFor(theme:Theme,page:string):PageDesign {
 const base=/^category(?:[0-9a-f]{2}){1,64}$/.test(page)?theme.pageDesign?.category:undefined;
 const own=theme.pageDesign?.[page];
 if(!base)return own||{};
 const visual={...base.visual};
 for(const [group,fields] of Object.entries(own?.visual||{}))visual[group]={...visual[group],...fields};
 const modules={...base.modules};
 for(const [id,fields] of Object.entries(own?.modules||{}))modules[id]={...modules[id],...fields};
 return {...base,...own,visual,modules,carouselDesign:{...base.carouselDesign,...own?.carouselDesign}};
}
/** Resolve sparse page overrides without mutating the saved global defaults. */
export function themeForPage(theme:Theme,page:string):Theme {
 const override=pageDesignFor(theme,page);
 if(!Object.keys(override).length)return theme;
 const visual=normalizeVisual(theme.visual,theme.colors);
 for(const [group,fields] of Object.entries(override.visual||{}))if(visual[group])Object.assign(visual[group],fields);
 return {...theme,carousel:{...theme.carousel,...override.carouselDesign},colors:{...theme.colors,...(override.background?{background:override.background}:{})},visual};
}

/** The visible screen owns its appearance, including navigation into a film. */
export function visualPageContext(page:string,hasFilm:boolean,playing:boolean):string {
 return hasFilm ? (playing ? 'player' : 'detail') : page;
}

/** Property panels expose only component families rendered by this screen. */
const pageGroups:Record<string,string[]>={
 home:['appbar','directory','navigation','cards','carousel','empty'],
 category:['appbar','directory','navigation','cards','carousel','input','empty'],
 search:['appbar','navigation','cards','carousel','input','empty'],
 ranking:['appbar','navigation','cards','carousel','empty'],
 schedule:['appbar','navigation','cards','carousel','empty'],
 shortdrama:['appbar','navigation','player','empty'],
 member:['appbar','navigation','cards','input','empty'],
 mine:['appbar','navigation','cards','empty'],
 library:['appbar','navigation','cards','empty'],
 history:['appbar','navigation','cards','empty'],
 settings:['appbar','navigation','cards','input'],
 disclaimer:['appbar'],privacy:['appbar'],about:['appbar','cards'],
 detail:['appbar','cards','input','empty'],
 player:['appbar','player','cards','input','empty'],
 together:['appbar','player','cards','input','empty'],
 login:['appbar','input','empty'],downloads:['appbar','cards','empty'],
 feedback:['appbar','input','empty'],orders:['appbar','cards','empty'],
 recharge:['appbar','cards','input','empty'],dialog:['appbar','dialog','input'],
 empty:['appbar','empty']
};
export function visualGroupsForPage(page?:string):string[] {
 return page ? [...(pageGroups[/^category(?:[0-9a-f]{2}){1,64}$/.test(page)?'category':page]||[])] : Object.keys(schema);
}

/** Fixed video slots share the Section renderer and editor with added modules. */
export function fixedModule(theme:Theme,page:string,id:string):import('./types').Section {
 const key=id.replace(/^(home|category)-/,'');
 const m=pageDesignFor(theme,page).modules?.[key]||{};
 const cards=themeForPage(theme,page).visual?.cards||{};
 const highlights=id==='home-highlights';
 const titles:Record<string,string>={'home-highlights':'快捷入口 / 高亮推荐','home-recommendations':'今日给您的专属推荐','home-content':'内容推荐','category-content':'分类影片'};
 return {id,title:m.title??titles[id]??'内容模块',subtitle:m.subtitle??'',kind:'poster',source:'latest',categoryId:'',enabled:m.visible!==false,
 style:m.style??(highlights?'grid2':'grid3'),limit:m.limit??(highlights?2:6),columns:m.columns??(highlights?2:3),
 radius:m.radius??Number(cards.radius??theme.layout.posterRadius),gap:m.gap??(highlights?5:4),ratio:m.ratio??(highlights?'16/9':'2/3'),
 titleSize:m.titleSize,background:m.background,textColor:m.textColor,showTitle:m.showTitle??true,showScore:m.showScore??true,showNote:m.showNote??true,showYear:m.showYear??false,showMore:m.showMore??false};
}
