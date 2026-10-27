<script setup lang="ts">
import {ref,onMounted,onUnmounted} from 'vue';import AppExperience from '@/components/AppExperience.vue';import defaults from '@/domain/default-theme.json';import {normalizeTheme} from '@/domain/normalize-theme';import type {Theme,Vod,Category,Platform} from '@/domain/types';import {api} from '@/services/api';import {nativeHost,type OperationsStatus} from '@/services/client-runtime';
const boot=JSON.parse(nativeHost()?.boot()||'{}');
function merge(base:any,value:any):any{if(value===undefined)return JSON.parse(JSON.stringify(base));if(!base||!value||Array.isArray(value)||typeof value!=='object')return value;const out={...base};for(const k of Object.keys(value))out[k]=merge(base[k],value[k]);return out;}
const theme=ref<Theme>(normalizeTheme(merge(defaults,boot.theme||{}))),items=ref<Vod[]>([]),categories=ref<Category[]>([]),sectionItems=ref<Record<string,Vod[]>>({}),error=ref(''),experience=ref<any>(null);
const device:Platform=boot.runtime?.device==='desktop'?'web':boot.runtime?.device||'mobile';const connection=ref<OperationsStatus>(boot.runtime?.operations||{state:'not-configured'});let generation=0;
if(boot.authenticated)uni.setStorageSync('hetun-member-token','native-session');else uni.removeStorageSync('hetun-member-token');
async function load(){const current=++generation;error.value='';try{const [catalog,list]=await Promise.all([api.catalog(),api.categories()]);if(current!==generation)return;items.value=catalog.items;categories.value=list.items;const groups:Record<string,Vod[]>={};const sections=theme.value.sections.filter(s=>s.enabled&&((s.source==='category'&&s.categoryId)||(s.orderBy==='manual'&&s.manualIds))).slice(0,40);let next=0;await Promise.all(Array.from({length:Math.min(4,sections.length)},async()=>{while(next<sections.length){const s=sections[next++];if(current!==generation)return;try{groups[s.id]=(await api.catalog(1,'',s.source==='category'?s.categoryId:'',s.orderBy==='manual'?s.manualIds||'':'')).items;}catch(e){if(current===generation)error.value=(e as Error).message;}}}));if(current===generation)sectionItems.value=groups;}catch(e){if(current===generation)error.value=(e as Error).message;}}
function operations(event:Event){const value=(event as CustomEvent).detail;theme.value=normalizeTheme(merge(defaults,value));load();}
function connectionChanged(event:Event){connection.value=(event as CustomEvent).detail;}
function link(event:Event){const id=(event as CustomEvent).detail?.id;if(id)experience.value?.openId(id);else experience.value?.go('home');}
function back(){if(!experience.value?.back())nativeHost()?.exit();}
onMounted(()=>{window.addEventListener('hetun-theme',operations);window.addEventListener('hetun-operations',connectionChanged);window.addEventListener('hetun-link',link);window.addEventListener('hetun-back',back);load();nativeHost()?.ready();});
onUnmounted(()=>{generation++;window.removeEventListener('hetun-theme',operations);window.removeEventListener('hetun-operations',connectionChanged);window.removeEventListener('hetun-link',link);window.removeEventListener('hetun-back',back);});
</script>
<template><AppExperience class="client-root" ref="experience" :theme="theme" :operations="connection" :items="items" :categories="categories" :section-items="sectionItems" :platform="device" :error="error" template-key="packaged" @retry="load"/></template>

<style>.client-root{height:100vh;height:100dvh;width:100%;}html,body,uni-page,uni-page-body{height:100%;margin:0;overflow:hidden;}</style>
