<script setup lang="ts">
import {computed} from 'vue';
import type {Theme,Vod,Category,Section,AppPage,NavItem} from '@/domain/types';
import {pageDesignFor,categoryPageKey,fixedModule} from '@/domain/visual';
import {available} from '@/domain/presentation';
import {assetUrl} from '@/services/api';
import AppIcon from './AppIcon.vue';
import PufferMark from './PufferMark.vue';
import ThemeCarousel from './ThemeCarousel.vue';
import FilmModule from './FilmModule.vue';
import MobileEpisodeList from './MobileEpisodeList.vue';
import AppEmptyState from './AppEmptyState.vue';
const props=withDefaults(defineProps<{
 theme:Theme;page:AppPage;items:Vod[];categories:Category[];sections:Section[];
 sectionItems:Record<string,Vod[]>;categoryEntry?:string;categoryId?:string;editing?:boolean;studio?:boolean;
 film:Vod|null;playerPreview?:boolean;playUrl:string;source:number;episode:number;
 favorite:boolean;loading:boolean;profile?:{user_name?:string;user_points?:number;member_name?:string}|null;
 history:Vod[];services:{page:AppPage;label:string;icon:string}[];
}>(),{categoryEntry:'',playerPreview:false});
const emit=defineEmits<{
 select:[id:string];navigate:[page:AppPage];category:[item:NavItem];filter:[id:string];open:[item:Vod];id:[id:string];
 more:[section:Section];play:[];source:[index:number];episode:[index:number];ended:[];videoError:[];
 remember:[];close:[];favorite:[];account:[membership:boolean];menu:[];
}>();
const pageKey=computed(()=>props.page==='category'&&props.categoryEntry?categoryPageKey(props.categoryEntry):props.page);
const layout=computed(()=>pageDesignFor(props.theme,pageKey.value));
const channels=computed(()=>props.theme.categories.filter(n=>n.enabled&&available(props.theme,n.page)));
const rows=computed(()=>{
 const fallbackId=props.page==='home'?'home-content':'category-content';
 const fallback=fixedModule(props.theme,pageKey.value,fallbackId);
 const rows=(props.sections.length?props.sections:[fallback]).filter(s=>s.enabled);
 const order=layout.value.moduleOrder||[];
 const rank=(id:string,index:number)=>order.includes(id)?order.indexOf(id):order.length+index;
 return rows.map((s,i)=>({s,rank:rank(s.id,i)})).sort((a,b)=>a.rank-b.rank).map(r=>r.s);
});
const carouselOrder=computed(()=>{const order=layout.value.moduleOrder||[];const i=order.indexOf('carousel');return i<0?-1:i;});
const episodes=computed(()=>props.film?.sources[props.source]?.episodes||[]);
const recommendations=computed(()=>props.items.filter(v=>v.id!==props.film?.id));
function moduleItems(s:Section){if(s.id==='category-content')return props.items;if(s.source==='category'||s.orderBy==='manual')return props.sectionItems[s.id]||[];return props.sectionItems[s.id]||props.items;}
function select(id:string,action:()=>void){if(props.editing)emit('select',id);else action();}
</script>
<template>
<view class="reference-app" :class="{'home-page':page==='home','player-page':!!film||playerPreview}">
 <slot name="status"/>
 <template v-if="film||playerPreview">
  <view class="video-frame" @click="editing&&emit('select','visual-player')">
   <video v-if="film&&playUrl" class="real-video" :key="film.id+'-'+source+'-'+episode" :src="playUrl" :poster="assetUrl(film.poster)" :title="film.title" autoplay controls object-fit="contain" :show-fullscreen-btn="true" :enable-progress-gesture="true" @play="emit('remember')" @ended="emit('ended')" @error="emit('videoError')"/>
   <template v-else>
    <image v-if="film?.poster" class="player-scene" :src="assetUrl(film.poster)" mode="aspectFill"/>
    <view class="video-shade"/>
    <button class="video-center" :disabled="loading||!film" aria-label="播放影片" @click="emit('play')"><AppIcon name="play" :size="40" color="currentColor"/><text>{{loading?'正在读取':film?'播放':'选择影片后播放'}}</text></button>
   </template>
   <view v-if="!playUrl" class="video-top"><button aria-label="返回影片列表" @click="emit('close')"><AppIcon name="back" :size="23" color="currentColor"/></button><text class="player-caption">{{film?.title||'播放器'}} {{episodes[episode]?.name||''}}</text></view>
   <view class="player-watermark"><image v-if="theme.brand.logo" :src="assetUrl(theme.brand.logo)" mode="aspectFit"/><text>{{theme.brand.name}}</text></view>
  </view>
  <view class="play-info">
   <view class="info-tabs"><text class="active">视频</text><text>影片信息</text><view class="spacer"/><button v-if="playUrl" @click="emit('close')">返回 ›</button></view>
   <view class="title-row"><text class="film-title">{{film?.title||'暂无影片'}}</text></view>
   <view v-if="film" class="metadata"><text v-for="(tag,i) in [film.score&&film.score+'分',film.year,film.area,film.category,film.note].filter(Boolean)" :key="i">{{tag}}</text></view>
   <view v-if="film" class="film-actions"><button @click="select('visual-cards',()=>emit('favorite'))"><AppIcon name="favorite" :size="24" :color="favorite?theme.colors.accent:theme.colors.text"/><text>{{favorite?'已收藏':'收藏'}}</text></button><button @click="select('visual-cards',()=>emit('navigate','history'))"><AppIcon name="history" :size="24" color="currentColor"/><text>观看历史</text></button></view>
   <text class="film-description">{{film?.description||'资源接入后显示影片简介、真实线路和集数'}}</text>
   <text v-if="film?.actors" class="film-description">主演：{{film.actors}}</text>
   <text v-if="film?.director" class="film-description">导演：{{film.director}}</text>
   <slot name="player-ads"/>
   <MobileEpisodeList v-if="film" :film="film" :source="source" :episode="episode" :colors="theme.colors" @source="emit('source',$event)" @episode="emit('episode',$event)"/>
   <AppEmptyState v-else title="尚未选择影片" description="此处与安装包使用同一个播放器；线路和选集由真实影片提供"/>
   <FilmModule v-if="recommendations.length" :theme="theme" :section="{...fixedModule(theme,'home','home-content'),title:'相关推荐',showMore:false}" :items="recommendations" :editing="editing" @select="emit('select',$event)" @open="emit('open',$event)"/>
  </view>
 </template>
 <template v-else-if="page==='mine'">
  <view class="profile-top"><view class="spacer"/><button aria-label="观看历史" @click="select('visual-appbar',()=>emit('navigate','history'))"><AppIcon name="history" :size="22" color="currentColor"/></button><button aria-label="应用设置" @click="select('visual-appbar',()=>emit('navigate','settings'))"><AppIcon name="settings" :size="22" color="currentColor"/></button></view>
  <view class="membership" @click="select('visual-cards',()=>emit('account',false))"><text v-if="theme.features.memberCard" class="vip-watermark">VIP</text><view class="profile-identity"><view class="avatar"><image v-if="theme.brand.logo" :src="assetUrl(theme.brand.logo)" mode="aspectFit"/><PufferMark v-else :size="47" :color="theme.colors.accent"/></view><view><text class="profile-name">{{profile?.user_name||'登录 / 注册'}}</text><text class="coins">积分 {{profile?.user_points??'—'}}</text></view></view><view v-if="theme.features.memberCard" class="vip-bottom"><text class="vip-heading">{{profile?.member_name||'VIP 会员'}}<text>专属权益</text></text><button class="gold-button" @click.stop="select('visual-cards',()=>emit('account',true))">{{profile?'立即续费':'开通会员'}}</button></view></view>
  <view class="profile-shortcuts"><button @click="select('visual-cards',()=>emit('navigate','history'))"><AppIcon name="history" :size="25" color="currentColor"/><text>观看历史</text></button><button @click="select('visual-cards',()=>emit('navigate','library'))"><AppIcon name="favorite" :size="25" color="currentColor"/><text>我的收藏</text></button><button v-if="theme.features.schedule" @click="select('visual-cards',()=>emit('navigate','schedule'))"><AppIcon name="schedule" :size="25" color="currentColor"/><text>影片排期</text></button><button @click="select('visual-cards',()=>emit('navigate','category'))"><AppIcon name="menu" :size="25" color="currentColor"/><text>影片分类</text></button></view>
  <view v-if="history.length" class="history-list"><button v-for="v in history.slice(0,6)" :key="v.id" @click="select('visual-cards',()=>emit('open',v))"><view class="history-cover"><image :src="assetUrl(v.poster)" mode="aspectFill"/></view><text class="history-caption">{{v.title}}</text></button></view><text v-else class="profile-note">暂无观看记录，看过的影片会保存在这里</text>
  <slot name="mine-ads"/>
  <view class="profile-services"><button v-for="s in services" :key="s.page" @click="select('visual-cards',()=>s.page==='member'?emit('account',true):emit('navigate',s.page))"><AppIcon :name="s.icon" :size="23" color="currentColor"/><text>{{s.label}}</text><text>›</text></button></view>
 </template>
 <template v-else>
  <view class="category-search"><button v-if="theme.features.serviceMenu" aria-label="打开服务菜单" @click="select('visual-appbar',()=>emit('menu'))"><AppIcon name="menu" :size="23" color="currentColor"/></button><button class="search-box" @click="select('visual-appbar',()=>emit('navigate','search'))"><AppIcon name="search" :size="16" color="currentColor"/><text>搜索影片</text><text class="search-filter">筛选</text></button><button class="brand-dot" aria-label="个人中心" @click="select('brand',()=>emit('navigate','mine'))"><image v-if="theme.brand.logo" :src="assetUrl(theme.brand.logo)" mode="aspectFit"/><PufferMark v-else :size="23" :color="theme.colors.accent"/></button></view>
  <view class="channel-tabs"><button v-for="n in channels" :key="n.id" :class="{active:page==='home'?n.page==='home':n.id===categoryEntry}" @click="select('categories',()=>emit('category',n))">{{n.label}}</button></view>
  <view v-if="page==='category'&&categories.length" class="category-filters"><button :class="{active:!categoryId}" @click="select('categories',()=>emit('filter',''))">全部</button><button v-for="c in categories" :key="c.id" :class="{active:categoryId===c.id}" @click="select('categories',()=>emit('filter',c.id))">{{c.name}}</button></view>
  <slot name="home-notice"/>
  <view class="page-modules">
   <ThemeCarousel v-if="layout.carousel??page==='home'" class="page-carousel" :style="{order:carouselOrder}" :theme="theme" :items="items" :design-preview="studio" native-mobile :editing="editing" @open="emit('open',$event)" @id="emit('id',$event)" @page="emit('navigate',$event as AppPage)" @select="emit('select',$event)"/>
   <FilmModule v-for="(s,index) in rows" :key="s.id" :style="{order:(layout.moduleOrder||[]).includes(s.id)?layout.moduleOrder!.indexOf(s.id):(layout.moduleOrder||[]).length+index}" :theme="theme" :section="s" :items="moduleItems(s)" :editing="editing" @open="emit('open',$event)" @select="emit('select',$event)" @more="emit('more',$event)"/>
  </view>
  <slot name="catalog-footer"/>
 </template>
</view>
</template>
<style scoped>
.reference-app{min-height:100%;color:var(--text);font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Microsoft YaHei',sans-serif;background:transparent}.reference-app button{padding:0;margin:0;border:0;background:transparent;color:inherit;font:inherit;line-height:1.4;cursor:pointer;min-width:0;border-radius:0}.reference-app button::after{border:0}.reference-app button:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}.reference-app button:active{opacity:.7}.reference-app image{display:block;width:100%;height:100%}.spacer{flex:1}.page-modules{display:flex;flex-direction:column}.page-carousel{min-width:0}
.category-search,.profile-top{box-sizing:border-box;min-height:var(--design-appbar-height);color:var(--design-appbar-text);background:linear-gradient(90deg,var(--design-appbar-background),var(--design-appbar-end))}.category-search{display:flex;gap:10px;align-items:center;padding:12px 8px 6px}.category-search>button{display:flex;align-items:center}.reference-app .search-box{flex:1;background:var(--design-input-background);border-radius:var(--design-input-radius);padding:6px 9px;display:flex;gap:4px;color:var(--design-input-text);font-size:calc(var(--design-appbar-size) - 7px);min-height:var(--design-input-height);box-sizing:border-box}.search-box>text:first-of-type{flex:1;text-align:left;white-space:nowrap;overflow:hidden}.search-filter{border-left:1px solid #8886;padding-left:6px;font-size:10px}.reference-app .brand-dot{width:27px;height:27px;flex:none;border-radius:50%;overflow:hidden;justify-content:center}.channel-tabs{display:flex;gap:var(--design-directory-gap);min-height:var(--design-directory-height);background:var(--design-directory-background);align-items:center;overflow:auto;white-space:nowrap;padding:0 5px;scrollbar-width:none}.channel-tabs button{color:var(--design-directory-text);font-size:var(--design-directory-size);flex:none}.channel-tabs .active{font-weight:700;font-size:var(--design-directory-activeSize);color:var(--design-directory-active)}
.category-filters{display:flex;overflow:auto;gap:10px;padding:10px;white-space:nowrap}.category-filters button{flex:none;color:var(--muted)}.category-filters button.active{color:var(--accent)}
.video-frame{position:relative;background:var(--design-player-background);color:var(--design-player-controls);aspect-ratio:1.78}.real-video{width:100%;height:100%;position:absolute;inset:0}.player-scene,.video-shade{position:absolute;inset:0}.video-shade{background:linear-gradient(#0008,transparent 38%,transparent 65%,#000b)}.video-top{position:absolute;left:8px;right:8px;top:7px;display:flex;align-items:center;gap:9px}.video-top button{display:grid;place-items:center;width:24px;height:30px}.video-center{position:absolute;inset:45px 0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;width:100%;color:var(--design-empty-color)}.player-caption{font-size:calc(var(--design-appbar-size) - 6px)}.player-watermark{display:flex;align-items:center;gap:5px;position:absolute;right:14px;bottom:58px;font-size:12px;color:var(--design-player-controls);opacity:calc(var(--design-player-watermarkOpacity) / 100);pointer-events:none}.reference-app .player-watermark image{width:28px;height:28px}.play-info{padding:0 13px 24px;color:var(--design-cards-text)}.info-tabs{display:flex;align-items:center;gap:13px;padding:10px 0 15px;color:var(--design-cards-muted);font-size:14px}.info-tabs .active{font-weight:650;color:var(--design-cards-text)}.title-row{display:flex;align-items:center;gap:9px}.film-title{font-size:calc(var(--design-cards-size) + 5px);font-weight:700}.metadata{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px;font-size:10px;color:var(--design-cards-muted)}.metadata>text{background:#8882;border-radius:20px;padding:2px 6px}.film-actions{display:flex;justify-content:space-around;margin:20px 0 18px}.film-actions button{display:flex;align-items:center;flex-direction:column;gap:5px}.film-description{display:block;font-size:12px;line-height:1.8;color:var(--design-cards-muted);margin-bottom:10px}
.profile-top{display:flex;gap:14px;align-items:center;padding:10px 15px 22px}.profile-top button{display:flex}.membership{position:relative;border-radius:0 12px 12px 0;background:linear-gradient(130deg,#292039 0%,#40236d 62%,#9235da 100%);height:98px;padding:0 9px;color:#eee2fb}.vip-watermark{position:absolute;right:0;top:-8px;font-size:58px;font-weight:900;font-style:italic;opacity:.07}.profile-identity{display:flex;gap:8px;align-items:center;transform:translateY(-6px)}.reference-app .avatar{width:47px;height:47px;border-radius:50%;overflow:hidden;flex:none}.profile-identity>view{display:flex;flex-direction:column;gap:5px}.profile-name{font-size:14px;font-weight:700}.coins{font-size:10px;background:#ffffff10;padding:1px 5px;border-radius:10px;color:#d7c7ef}.vip-bottom{display:flex;align-items:center;justify-content:space-between;position:absolute;left:9px;right:9px;bottom:11px;gap:5px}.vip-heading{color:#f8d8a4;font-size:13px;font-weight:700;font-style:italic}.vip-heading>text{font-size:10px;color:#bc9acb;font-weight:400;margin-left:5px}.reference-app .gold-button{background:linear-gradient(110deg,#ffdc83,#fff0b9);color:#604320;border-radius:3px;padding:6px 10px;font-size:10px;white-space:nowrap}.profile-shortcuts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));padding:12px 0 10px}.profile-shortcuts button{display:flex;flex-direction:column;align-items:center;gap:5px;font-size:11px}.history-list{display:flex;overflow:auto;gap:7px;padding:8px 0 10px;border-top:5px solid #8881;scrollbar-width:none}.history-list>button{width:30%;min-width:115px;text-align:left;flex:none;overflow:hidden}.history-cover{height:65px;overflow:hidden;border-radius:var(--design-cards-radius)}.history-caption{display:block;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:5px}.profile-note{display:block;color:var(--muted);font-size:11px;padding:18px 12px;text-align:center}.profile-services{padding:12px}.profile-services button{display:flex;align-items:center;gap:12px;width:100%;padding:12px 0;border-bottom:1px solid #8882}.profile-services button>text:first-of-type{flex:1;text-align:left}
</style>
